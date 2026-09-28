#include "TVBridgeSubsystem.h"
#include "TVCharacter.h"
#include "TVControlSettings.h"
#include "GameFramework/InputSettings.h"
#include "TVWorldProjection.h"
#include "TVInteractionFocus.h"
#include "TVInteractionSpec.generated.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "Camera/PlayerCameraManager.h"
#include "Dom/JsonObject.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "IWebSocket.h"

TSharedRef<FJsonObject> UTVBridgeSubsystem::ControlState() const {
    auto J=MakeShared<FJsonObject>();const double Now=FPlatformTime::Seconds();
    auto* P=Cast<ATVCharacter>(UGameplayStatics::GetPlayerCharacter(GetWorld(),0));const FVector Input=P?P->IntentDirection():FVector::ZeroVector;
    J->SetNumberField(TEXT("wallSeconds"),Now);J->SetNumberField(TEXT("inputX"),Input.X);J->SetNumberField(TEXT("inputZ"),Input.Y);J->SetBoolField(TEXT("sprint"),P&&P->IsSprinting());
    J->SetBoolField(TEXT("modal"),HasModalScreen());J->SetBoolField(TEXT("controller"),bControls);J->SetBoolField(TEXT("transport"),bTransportConnected);
    J->SetStringField(TEXT("epoch"),InteractionEpoch);J->SetStringField(TEXT("bodyId"),InteractionBody);
    J->SetNumberField(TEXT("ack"),LastMovementAck);J->SetNumberField(TEXT("lastSequence"),Sequence);J->SetNumberField(TEXT("pending"),PendingMovement.Num());
    J->SetNumberField(TEXT("snapshotAge"),Now-LastSnapshotReceived);J->SetNumberField(TEXT("localStateAge"),Now-LastLocalStateAt);
    J->SetBoolField(TEXT("eligible"),Confirmed.bEligible);J->SetBoolField(TEXT("geometryReady"),GeometrySize>0&&PredictionColumns.Num()==GeometrySize*GeometrySize);
    J->SetNumberField(TEXT("correctionCm"),CorrectionCm);J->SetStringField(TEXT("restriction"),MovementRestriction);
    J->SetStringField(TEXT("focusedTarget"),FocusedTargetId);J->SetStringField(TEXT("focusedAction"),FocusedActionId);
    return J;
}
void UTVBridgeSubsystem::UpdateInteractionFocus() {
    FocusedTargetId.Empty();FocusedActionId.Empty();FocusedKind.Empty();NearbyInteraction.Empty();NearbyPrompt.Empty();TalkTargetBody.Empty();FocusedBounds=FBox2D(ForceInit);FocusedTitle.Empty();FocusedVerb.Empty();FocusedReason.Empty();
    if(!IsLive()||HasModalScreen())return;
    auto* PC=GetWorld()->GetFirstPlayerController();if(!PC||!PC->PlayerCameraManager)return;
    int32 Width=0,Height=0;PC->GetViewportSize(Width,Height);double Best=TNumericLimits<double>::Max();
    const FVector2D Aim(Width*.5,Height*.5);
    for(const auto& T:FocusTargets) {
        FBox Bounds(ForceInit);
        if(T.Kind==TEXT("person")||T.Kind==TEXT("person_unavailable")){auto* Body=Bodies.FindRef(T.Id).Get();if(!IsValid(Body)||Body->IsHidden())continue;Bounds=Body->GetMesh()->Bounds.GetBox();}
        else if(!WorldProjection||!WorldProjection->FindVisualBounds(T.Id,Bounds)) {
            const FVector Pos=ToUnreal(T.Position)-FVector(0,0,90);
            Bounds=FBox(Pos-FVector(18,18,0),Pos+FVector(18,18,35));
        }
        FBox2D Screen(ForceInit);bool Visible=true;
        for(int32 I=0;I<8;++I){FVector2D P;const FVector Corner((I&1)?Bounds.Max.X:Bounds.Min.X,(I&2)?Bounds.Max.Y:Bounds.Min.Y,(I&4)?Bounds.Max.Z:Bounds.Min.Z);
            if(!PC->ProjectWorldLocationToScreen(Corner,P,true)){Visible=false;break;}Screen+=P;}
        if(!Visible)continue;const double Score=TVInteractionFocus::Score(Screen,Aim,Height);
        if(Score<Best||(Score==Best&&T.Id<FocusedTargetId)){Best=Score;FocusedTargetId=T.Id;FocusedActionId=T.Action;FocusedKind=T.Kind;NearbyPrompt=T.Label;FocusedBounds=Screen;FocusedTitle=T.Title;FocusedVerb=T.Verb;FocusedReason=T.Reason;}
    }
    if(FocusedKind==TEXT("person"))TalkTargetBody=FocusedTargetId;else if(FocusedKind!=TEXT("person_unavailable"))NearbyInteraction=FocusedActionId;
}
void UTVBridgeSubsystem::UpdatePlayerShell() {
    if(bSignInRequired)return;
    auto* PC=GetWorld()->GetFirstPlayerController();auto* P=PC?Cast<ATVCharacter>(PC->GetPawn()):nullptr;if(!PC||!P||!PC->IsLocalController())return;
    if(!PlayerShell){PlayerShell=CreateWidget<UTVPlayerShellWidget>(PC);PlayerShell->OnCommand().AddUObject(this,&UTVBridgeSubsystem::UICommand);
        PlayerShell->OnModalChanged().AddWeakLambda(this,[this](bool Modal){if(auto* C=Cast<ATVCharacter>(UGameplayStatics::GetPlayerCharacter(GetWorld(),0)))C->RefreshInputContext(Modal);});
        PlayerShell->AddToViewport(10);PlayerShell->ActivateWidget();}
    PlayerShell->SetInputActions(P->SemanticActions.FindRef(TEXT("Interact")),P->SemanticActions.FindRef(TEXT("UIBack")));
    MovementRestriction=CanonicalRestriction;
    if(!bTransportConnected||!IsLive())MovementRestriction=TEXT("Reconnecting — movement paused");
    else if(!bControls)MovementRestriction=TEXT("Observer connection — another controller owns this body");
    else if(!bPredictionReady||FPlatformTime::Seconds()-LastLocalStateAt>TVInteractionSpec::inputHorizonSeconds)MovementRestriction=TEXT("Waiting for current movement / collision state");
    else if(PredictedCombat.Locked(CombatAge))MovementRestriction=TEXT("Recovering");
    else if(!HasModalScreen()&&Confirmed.bEligible&&!P->IntentDirection().IsNearlyZero()&&PredictionVelocity.Size2D()<1)MovementRestriction=TEXT("Blocked");
    FTVUISnapshot S;S.Revision=SnapshotCount;S.FocusedLabel=NearbyPrompt;S.FocusedTitle=FocusedTitle;S.FocusedVerb=FocusedVerb;S.FocusedReason=FocusedReason;S.bFocusedPerson=FocusedKind.StartsWith(TEXT("person"));S.FocusedTargetId=FocusedTargetId;S.FocusedActionId=FocusedActionId;
    S.FocusedBounds.bHasFocusBounds=FocusedBounds.bIsValid;S.FocusedBounds.BoundsPixels=FocusedBounds;
    S.Vitals=PlayerVitals+TEXT("\n")+MobilitySummary;S.Journal=JournalSummary+TEXT("\n")+KnowledgeSummary;S.Restriction=MovementRestriction+(WorkStatus.IsEmpty()?TEXT(""):(MovementRestriction.IsEmpty()?TEXT(""):TEXT("\n"))+WorkStatus)+(LastResult.IsEmpty()?TEXT(""):TEXT("   ")+LastResult);
    if(CarriedRows.Num()||InventoryItemIds.IsEmpty())S.Inventory=CarriedRows;
    else for(int32 I=0;I<InventoryItemIds.Num();++I){
        // An older server sends no projected actions: offer only what it always accepted, and let it refuse.
        FTVUIItemRow Row;Row.Id=InventoryItemIds[I];Row.Label=InventoryItemLabels[I];
        for(const FString& K:TArray<FString>{TEXT("consume"),TEXT("drop")}){FTVUIActionRow A;A.Id=K+TEXT(":")+Row.Id;A.Kind=K;A.Label=K==TEXT("drop")?TEXT("Drop"):TEXT("Eat or drink");A.bAvailable=true;A.RequestType=TEXT("interact");A.RequestKey=A.Id;A.ItemId=Row.Id;Row.Actions.Add(A);}
        S.Inventory.Add(Row);
    }
    S.Abilities=AbilityRows;
    if(AbilityRows.IsEmpty())for(const FString& K:TArray<FString>{TEXT("hush"),TEXT("train"),TEXT("meditate"),TEXT("advance"),TEXT("rest")}){FTVUIActionRow A;A.Id=K;A.Kind=K;A.Label=K==TEXT("advance")?TEXT("Attempt Iron breakthrough"):K==TEXT("rest")?TEXT("Rest / wake"):FName::NameToDisplayString(K,false);A.bAvailable=true;A.RequestType=TEXT("person_action");A.RequestKey=K;S.Abilities.Add(A);}
    for(int32 I=0;I<MechanismLabels.Num();++I){FTVUIActionRow A;A.Id=FString::Printf(TEXT("mechanism:%d"),I);A.Kind=TEXT("mechanism");
        A.Label=FString::Printf(TEXT("Mechanism %d — %s"),MechanismOf.IsValidIndex(I)?MechanismOf[I]+1:1,*MechanismLabels[I]);A.bAvailable=true;S.Abilities.Add(A);}
    for(int32 I=0;I<ContainerItemIds.Num();++I){FTVUIItemRow Row;Row.Id=ContainerItemIds[I];Row.Label=ContainerItemLabels[I];S.Container.Add(Row);}
    S.ContainerId=OpenContainerId;S.ContainerName=OpenContainerName;S.bDialogueOpen=bDialogueOpen;S.DialogueSpeaker=DialogueSpeaker;S.DialogueOccupation=DialogueOccupation;S.DialogueLines=DialogueLines;S.DialogueOptionIds=DialogueOptionIds;S.DialogueOptionLabels=DialogueOptionLabels;
    PlayerShell->SetSnapshot(S);
    if(bDialogueOpen&&!bShellDialogue){if(PlayerShell->HasModalScreen())PlayerShell->CloseTop();PlayerShell->OpenDialogue();}
    bShellDialogue=bDialogueOpen;
    if(!PendingOpenContainer.IsEmpty()&&PendingOpenContainer==OpenContainerId){PendingOpenContainer.Empty();PlayerShell->OpenContainer();}
}
void UTVBridgeSubsystem::UICommand(ETVUICommand Command,const FString& Primary,const FString& Secondary,int32 Index) {
    if(Command==ETVUICommand::Quit){SaveWorld();UKismetSystemLibrary::QuitGame(this,GetWorld()->GetFirstPlayerController(),EQuitPreference::Quit,false);return;}
    if(Command==ETVUICommand::SignOut){
        SaveWorld();if(auto* C=Cast<ATVCharacter>(UGameplayStatics::GetPlayerCharacter(GetWorld(),0)))C->RefreshInputContext(true);
        ClearBufferedInput();bControls=bTransportConnected=bCanonicalReady=bPredictionReady=false;
        if(Socket){Socket->OnMessage().Clear();Socket->OnConnected().Clear();Socket->OnConnectionError().Clear();Socket->OnClosed().Clear();Socket->Close(1000,TEXT("signed out"));Socket.Reset();}
        if(PlayerShell){PlayerShell->RemoveFromParent();PlayerShell=nullptr;}
        bDialogueOpen=bShellDialogue=false;RequireSignIn(TEXT("Signed out. Continue your character whenever you are ready."));return;
    }
    if(Command==ETVUICommand::OpenPanel){OpenActionPanel(Primary);return;}
    if(Command==ETVUICommand::Setting){GetMutableDefault<UTVControlSettings>()->Adjust(Primary);return;}
    if(Command==ETVUICommand::Rebind){
        if(Secondary.IsEmpty()){if(PlayerShell)PlayerShell->BeginRebind(Primary);return;}
        if(!UTVControlSettings::Rebind(GetMutableDefault<UInputSettings>(),FName(*Primary),FKey(FName(*Secondary)))){
            LastResult=TEXT("That input is reserved or has no safe binding to swap.");return;
        }
        if(auto* C=Cast<ATVCharacter>(UGameplayStatics::GetPlayerCharacter(GetWorld(),0)))C->RebuildInputMappings();return;
    }

    if(Command==ETVUICommand::PersonAction){
        if(PlayerShell)PlayerShell->CloseTop();
        if(Primary==TEXT("rest")||Primary==TEXT("wake"))ToggleRest();else if(Primary==TEXT("crouch"))SetCrouch(!bCrouchHeld);else if(Primary==TEXT("hush"))Hush();else PersonAction(Primary,Primary+TEXT(" requested"));return;
    }
    if(Command==ETVUICommand::Back){if(bDialogueOpen)CloseDialogue();if(PlayerShell&&PlayerShell->HasModalScreen())PlayerShell->CloseTop();return;}
    if(Command==ETVUICommand::Pause){TogglePause();return;}
    if(!IsLive())return;
    if(Command==ETVUICommand::SaveWorld){SaveWorld();return;}
    if(Command==ETVUICommand::Interact){if(Primary==FocusedTargetId&&Secondary==FocusedActionId)Interact();return;}
    if(Command==ETVUICommand::ItemAction){RunProjectedAction(Primary);return;}
    auto M=MakeShared<FJsonObject>();
    if(Command==ETVUICommand::DialogueChoice){if(!DialogueOptionIds.Contains(Primary))return;M->SetStringField(TEXT("type"),TEXT("dialogue_option"));M->SetStringField(TEXT("optionId"),Primary);}
    else if(Command==ETVUICommand::DropItem||Command==ETVUICommand::EatItem){M->SetStringField(TEXT("type"),TEXT("interact"));M->SetStringField(TEXT("interactionId"),(Command==ETVUICommand::DropItem?TEXT("drop:"):TEXT("consume:"))+Primary);}
    else {M->SetStringField(TEXT("type"),TEXT("container_transfer"));M->SetStringField(TEXT("containerId"),OpenContainerId);M->SetStringField(TEXT("itemId"),Primary);M->SetStringField(TEXT("direction"),Command==ETVUICommand::TransferItemToContainer?TEXT("into"):TEXT("out"));}
    Send(M);
}
void UTVBridgeSubsystem::OpenActionPanel(const FString& Kind){if(PlayerShell)PlayerShell->OpenActionPanel(Kind);}
bool UTVBridgeSubsystem::ParseActionRow(const TSharedPtr<FJsonObject>& J,const FString& ItemId,FTVUIActionRow& Out){
    if(!J||!J->TryGetStringField(TEXT("id"),Out.Id)||Out.Id.IsEmpty())return false;
    J->TryGetStringField(TEXT("kind"),Out.Kind);J->TryGetStringField(TEXT("label"),Out.Label);J->TryGetStringField(TEXT("detail"),Out.Detail);
    J->TryGetBoolField(TEXT("available"),Out.bAvailable);J->TryGetStringField(TEXT("reason"),Out.Reason);Out.ItemId=ItemId;
    const TSharedPtr<FJsonObject>* Request=nullptr;
    if(J->TryGetObjectField(TEXT("request"),Request)&&Request&&Request->IsValid()){
        (*Request)->TryGetStringField(TEXT("type"),Out.RequestType);
        if(Out.RequestType==TEXT("interact"))(*Request)->TryGetStringField(TEXT("interactionId"),Out.RequestKey);
        else if(Out.RequestType==TEXT("person_action")){const TSharedPtr<FJsonObject>* Intent=nullptr;if((*Request)->TryGetObjectField(TEXT("intent"),Intent)&&Intent)(*Intent)->TryGetStringField(TEXT("kind"),Out.RequestKey);}
    }
    return true;
}
void UTVBridgeSubsystem::RunProjectedAction(const FString& ActionId){
    if(!IsLive())return;
    // A mechanism in reach: the canonical panel's own action, sent as the same person intent the
    // inspector sends (ChooseMechanism). Ordinary players reach it from the action panel.
    if(ActionId.StartsWith(TEXT("mechanism:"))){ChooseMechanism(FCString::Atoi(*ActionId.Mid(10)));return;}
    const FTVUIActionRow* Row=nullptr;
    for(const auto& Item:CarriedRows)for(const auto& A:Item.Actions)if(A.Id==ActionId)Row=&A;
    if(!Row)for(const auto& A:AbilityRows)if(A.Id==ActionId)Row=&A;
    if(!Row){LastResult=TEXT("That is no longer possible.");ResultClock=0;return;}
    // Availability is advisory; the server decides. A row it already says is unavailable is not sent.
    if(!Row->bAvailable){LastResult=Row->Reason.IsEmpty()?TEXT("You cannot do that right now."):Row->Reason;ResultClock=0;return;}
    auto M=MakeShared<FJsonObject>();
    if(Row->RequestType==TEXT("interact")&&!Row->RequestKey.IsEmpty()){M->SetStringField(TEXT("type"),TEXT("interact"));M->SetStringField(TEXT("interactionId"),Row->RequestKey);}
    else if(Row->RequestType==TEXT("person_action")&&!Row->RequestKey.IsEmpty()){
        auto Intent=MakeShared<FJsonObject>();Intent->SetStringField(TEXT("kind"),Row->RequestKey);if(!Row->ItemId.IsEmpty())Intent->SetStringField(TEXT("itemId"),Row->ItemId);
        M->SetStringField(TEXT("type"),TEXT("person_action"));M->SetObjectField(TEXT("intent"),Intent);
    } else {LastResult=TEXT("That cannot be done from here.");ResultClock=0;return;}
    // Item actions keep the inventory open so the result (the loaf gone, hunger eased) is seen there;
    // a bodily action (meditate, train) returns to the world where it happens.
    if(Row->RequestType==TEXT("person_action")&&PlayerShell)PlayerShell->CloseTop();
    Send(M);LastResult=Row->Label+TEXT("...");ResultClock=0;
}
