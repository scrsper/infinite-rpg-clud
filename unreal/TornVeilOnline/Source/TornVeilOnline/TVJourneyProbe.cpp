#include "CoreMinimal.h"

#if WITH_DEV_AUTOMATION_TESTS
#include "TVBridgeSubsystem.h"
#include "TVCharacter.h"
#include "TVSignInWidget.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "UnrealClient.h"
#include "Containers/Ticker.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "GenericPlatform/GenericPlatformInputDeviceMapper.h"
#include "InputKeyEventArgs.h"
#include "InputCoreTypes.h"
#include "Algo/Count.h"
#include "Misc/App.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Kismet/GameplayStatics.h"

/**
 * TV.JourneyProbe <config.json>: a bounded, automated ordinary-player journey in a real world.
 *
 * It sends only what a player's devices send: held W and MouseX to walk and turn, E to talk when
 * the ordinary Talk prompt is on the chosen person, number keys and Escape to the focused dialogue,
 * I to open the inventory and Enter on its focused action. The server adjudicates every step. It
 * reads only what the client already shows (prompts, dialogue text, projected carried rows, the
 * vitals line) and records a frame at each step. The config names who to walk to; that knowledge
 * is test setup, so a pass proves the loop works end to end, not that a player can discover it.
 */
namespace TVJourneyProbe {
struct FState {
    bool bRunning=false; int32 Phase=0; double Started=0,PhaseAt=0,BlockedSince=-1,SideStepUntil=0; int32 Choice=0,Shot=0;
    FString Out,TargetBody; TArray<FString> Picks; bool bEat=true,bQuit=true,bObserveOnly=false; double Timeout=300;
    TArray<TSharedPtr<FJsonValue>> Steps; TArray<FString> Frames; FString LastDialogue; double HungerBefore=-1,WealthBefore=-1;
    TWeakObjectPtr<UWorld> World; FTSTicker::FDelegateHandle Ticker; bool bForward=false,bStrafe=false,bSignedIn=false,bNearest=false;
    TSet<FString> Asked,Faced; FString Target; TArray<FVector2D> Explore; TArray<FString> ExploreLabels; int32 Waypoint=0; double TargetSince=0; FString OptionsAtChoice;
    TArray<double> FrameSeconds; // every frame from entering the world to the end of the journey
};
static FState S;

static UWorld* GameWorld(){for(const FWorldContext& C:GEngine->GetWorldContexts())if((C.WorldType==EWorldType::Game||C.WorldType==EWorldType::PIE)&&C.World())return C.World();return nullptr;}
static void Key(const FKey& K,EInputEvent E,float V=1.f){auto* W=GameWorld();auto* PC=W?W->GetFirstPlayerController():nullptr;if(PC)PC->InputKey(FInputKeyEventArgs(nullptr,IPlatformInputDeviceMapper::Get().GetDefaultInputDevice(),K,E,V,K.IsAxis1D(),FPlatformTime::Cycles64()));}
static void Tap(const FKey& K){Key(K,IE_Pressed);Key(K,IE_Released,0.f);}
static void SlateKey(const FKey& K){
    if(!FSlateApplication::IsInitialized())return;const uint32* KC=nullptr;const uint32* CC=nullptr;FInputKeyManager::Get().GetCodesFromKey(K,KC,CC);
    FSlateApplication::Get().ProcessKeyDownEvent(FKeyEvent(K,FModifierKeysState(),0,false,CC?*CC:0,KC?*KC:0));
    FSlateApplication::Get().ProcessKeyUpEvent(FKeyEvent(K,FModifierKeysState(),0,false,CC?*CC:0,KC?*KC:0));
}
static double Number(const FString& Text,const TCHAR* After){ // "Hunger 20%" → 20; "15 silver" → 15
    const int32 At=Text.Find(After);if(At==INDEX_NONE)return -1;FString Rest=Text.Mid(At+FCString::Strlen(After)).TrimStart();
    int32 End=0;while(End<Rest.Len()&&(FChar::IsDigit(Rest[End])||Rest[End]=='.'))++End;return End?FCString::Atod(*Rest.Left(End)):-1;
}
static double Silver(const FString& Vitals){const int32 At=Vitals.Find(TEXT(" silver"),ESearchCase::IgnoreCase,ESearchDir::FromEnd);if(At==INDEX_NONE)return -1;int32 B=At;while(B>0&&(FChar::IsDigit(Vitals[B-1])||Vitals[B-1]=='.'))--B;return FCString::Atod(*Vitals.Mid(B,At-B));}
static void Step(const FString& Name,UTVBridgeSubsystem* B,TSharedPtr<FJsonObject> Extra=nullptr){
    auto J=Extra.IsValid()?Extra:MakeShared<FJsonObject>();J->SetStringField(TEXT("step"),Name);J->SetNumberField(TEXT("atSeconds"),FPlatformTime::Seconds()-S.Started);
    if(B){J->SetStringField(TEXT("vitals"),B->PlayerVitals);J->SetStringField(TEXT("status"),B->MovementRestriction);J->SetStringField(TEXT("lastResult"),B->LastResult);J->SetStringField(TEXT("prompt"),B->NearbyPrompt);}
    const FString Frame=FPaths::Combine(S.Out,FString::Printf(TEXT("journey-%02d-%s.png"),S.Shot++,*Name));FScreenshotRequest::RequestScreenshot(Frame,true,false);S.Frames.Add(Frame);J->SetStringField(TEXT("frame"),Frame);
    S.Steps.Add(MakeShared<FJsonValueObject>(J));UE_LOG(LogTemp,Display,TEXT("TV_JOURNEY step=%s"),*Name);
}
static void Release(){if(S.bForward){Key(EKeys::W,IE_Released,0.f);S.bForward=false;}if(S.bStrafe){Key(EKeys::D,IE_Released,0.f);S.bStrafe=false;}}
static void Finish(const FString& Status,const FString& Error=FString()){
    Release();auto* W=S.World.Get();auto* B=W?W->GetSubsystem<UTVBridgeSubsystem>():nullptr;
    auto R=MakeShared<FJsonObject>();R->SetStringField(TEXT("kind"),TEXT("automated native ordinary-input journey; config names the person, so not a discoverability proof"));
    R->SetStringField(TEXT("status"),Status);R->SetStringField(TEXT("error"),Error);R->SetNumberField(TEXT("elapsedSeconds"),FPlatformTime::Seconds()-S.Started);
    R->SetArrayField(TEXT("steps"),S.Steps);
    { // Frame time while playing. Includes the frames that capture evidence screenshots, so it is a
      // pessimistic figure for this machine and build configuration, not a hardware-wide claim.
        TArray<double> Sorted=S.FrameSeconds;Sorted.Sort();auto F=MakeShared<FJsonObject>();F->SetNumberField(TEXT("frames"),Sorted.Num());
        for(const auto& P:TArray<TPair<const TCHAR*,double>>{{TEXT("p50Ms"),.5},{TEXT("p95Ms"),.95},{TEXT("p99Ms"),.99},{TEXT("maxMs"),1.}})
            F->SetNumberField(P.Key,Sorted.IsEmpty()?0:1000*Sorted[FMath::Clamp(FMath::CeilToInt(Sorted.Num()*P.Value)-1,0,Sorted.Num()-1)]);
        F->SetNumberField(TEXT("over33msFrames"),Algo::CountIf(Sorted,[](double T){return T>1./30;}));
        F->SetStringField(TEXT("includes"),TEXT("evidence screenshot frames"));R->SetObjectField(TEXT("frameTiming"),F);}
    if(B){R->SetStringField(TEXT("release"),B->ServerRelease);R->SetStringField(TEXT("worldId"),B->WorldId);R->SetStringField(TEXT("character"),B->CharacterName);
        TArray<TSharedPtr<FJsonValue>> Rows;for(const auto& Item:B->CarriedRows){auto I=MakeShared<FJsonObject>();I->SetStringField(TEXT("label"),Item.Label);TArray<TSharedPtr<FJsonValue>> A;for(const auto& Act:Item.Actions)A.Add(MakeShared<FJsonValueString>(FString::Printf(TEXT("%s:%s%s"),*Act.Kind,Act.bAvailable?TEXT("available"):TEXT("refused"),Act.Reason.IsEmpty()?TEXT(""):*(TEXT(" (")+Act.Reason+TEXT(")")))));I->SetArrayField(TEXT("actions"),A);Rows.Add(MakeShared<FJsonValueObject>(I));}
        R->SetArrayField(TEXT("carriedAtEnd"),Rows);R->SetStringField(TEXT("vitalsAtEnd"),B->PlayerVitals);}
    FString Json;auto Writer=TJsonWriterFactory<>::Create(&Json);FJsonSerializer::Serialize(R,Writer);Writer->Close();
    FFileHelper::SaveStringToFile(Json,*FPaths::Combine(S.Out,TEXT("journey.json")),FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
    UE_LOG(LogTemp,Display,TEXT("TV_JOURNEY finished status=%s error=%s"),*Status,*Error);
    S.bRunning=false;
    if(S.bQuit&&B)B->UICommand(ETVUICommand::Quit,FString(),FString(),INDEX_NONE); // the pause menu's own Quit: save, then leave
}
static void Next(int32 Phase){S.Phase=Phase;S.PhaseAt=FPlatformTime::Seconds();}
static const TCHAR* NumberKey(int32 I){static const TCHAR* K[]={TEXT("One"),TEXT("Two"),TEXT("Three"),TEXT("Four"),TEXT("Five"),TEXT("Six"),TEXT("Seven"),TEXT("Eight"),TEXT("Nine")};return K[FMath::Clamp(I,0,8)];}
/** End a conversation the way a player does: the "Goodbye" reply by its number, or Escape. */
static void Goodbye(UTVBridgeSubsystem* B){
    const int32 I=B->DialogueOptionLabels.IndexOfByPredicate([](const FString& L){return L==TEXT("Goodbye")||L==TEXT("Nothing today")||L==TEXT("Not today");});
    if(I!=INDEX_NONE&&I<9)SlateKey(FKey(NumberKey(I)));else SlateKey(EKeys::Escape);
}
/** The named person, or ("nearest") whoever in view we have not yet asked, as a player would. */
static bool ChooseTarget(UTVBridgeSubsystem* B,APawn* Pawn){
    if(!S.bNearest){S.Target=S.TargetBody;return B->Bodies.Contains(S.Target);}
    const FString Previous=S.Target;double Best=TNumericLimits<double>::Max();S.Target.Empty();
    for(const auto& Pair:B->Bodies){ATVCharacter* C=Pair.Value;if(!IsValid(C)||C==Pawn||C->bDead||C->bCanonicalPlayer||S.Asked.Contains(Pair.Key))continue;
        const double D=FVector::Dist2D(C->GetActorLocation(),Pawn->GetActorLocation());if(D<Best){Best=D;S.Target=Pair.Key;}}
    if(S.Target!=Previous)S.TargetSince=FPlatformTime::Seconds();
    return !S.Target.IsEmpty();
}
/** A person we cannot engage in 20 s (someone else keeps stepping under the prompt) is left be. */
static bool GiveUpOnTarget(UTVBridgeSubsystem* B,APawn* Pawn){
    if(!S.bNearest||FPlatformTime::Seconds()-S.TargetSince<20)return false;
    S.Asked.Add(S.Target);Release();
    if(ChooseTarget(B,Pawn))Next(1);else if(S.Waypoint<S.Explore.Num())Next(9);else Finish(TEXT("failed"),TEXT("nobody nearby could be engaged"));
    return true;
}

static bool Tick(float){
    if(!S.bRunning)return false;
    const double Now=FPlatformTime::Seconds(),InPhase=Now-S.PhaseAt;
    if(Now-S.Started>S.Timeout){Finish(TEXT("failed"),FString::Printf(TEXT("timed out in phase %d"),S.Phase));return false;}
    auto* W=GameWorld();S.World=W;auto* B=W?W->GetSubsystem<UTVBridgeSubsystem>():nullptr;auto* PC=W?W->GetFirstPlayerController():nullptr;APawn* Pawn=PC?PC->GetPawn():nullptr;
    if(!B||!PC)return true;
    if(S.Shot>0&&B->IsLive())S.FrameSeconds.Add(FApp::GetDeltaTime());
    switch(S.Phase){
    case 0: // entered: the world, our person and (unless observing) the chosen person are projected
        // A new account meets the ordinary sign-in screen; press its "begin a new life" button
        // with the profile's name and sex already in the fields (once; the screen then waits).
        if(B->bSignInRequired&&B->SignIn&&InPhase>2&&!S.bSignedIn){Step(TEXT("sign-in"),B);B->SignIn->BeginNewLife();S.bSignedIn=true;return true;}
        if(!B->IsLive()||!B->bCanonicalReady||!Pawn||InPhase<3)return true;
        if(B->ProjectedRegions<9&&InPhase<45)return true; // let the surroundings stream in, as a player waits
        if(S.bObserveOnly){Step(TEXT("reconnected"),B);Tap(EKeys::I);Next(5);return true;}
        if(!ChooseTarget(B,Pawn)){if(S.bNearest&&S.Waypoint<S.Explore.Num()){Next(9);return true;}if(InPhase>60){Finish(TEXT("failed"),TEXT("chosen person never came into view"));return false;}return true;}
        S.HungerBefore=Number(B->PlayerVitals,TEXT("Hunger"));S.WealthBefore=Silver(B->PlayerVitals);Step(TEXT("entered"),B);Next(1);return true;
    case 1: { // walk: hold W, turn with MouseX toward where the person actually is
        ATVCharacter* T=B->Bodies.FindRef(S.Target);
        if(!IsValid(T)){if(S.bNearest){S.Asked.Add(S.Target);if(ChooseTarget(B,Pawn))return true;if(S.Waypoint<S.Explore.Num()){Release();Next(9);return true;}}Finish(TEXT("failed"),TEXT("lost sight of the chosen person"));return false;}
        if(GiveUpOnTarget(B,Pawn))return S.bRunning;
        const FVector To=T->GetActorLocation()-Pawn->GetActorLocation();const double Dist=To.Size2D();
        const float Error=FMath::FindDeltaAngleDegrees(PC->GetControlRotation().Yaw,To.Rotation().Yaw);
        if(FMath::Abs(Error)>1.5f)Key(EKeys::MouseX,IE_Axis,FMath::Clamp(Error*2.f,-60.f,60.f));
        if(B->TalkTargetBody==S.Target&&Dist<260){Release();if(!S.Faced.Contains(S.Target)){S.Faced.Add(S.Target);Step(TEXT("facing"),B);}Next(2);return true;}
        if(Dist<140){Release();return true;} // close but not yet in view of the prompt: keep turning only
        if(!S.bForward){Key(EKeys::W,IE_Pressed);S.bForward=true;}
        // Blocked by something between us: step sideways briefly, as a player would, then carry on.
        if(B->MovementRestriction==TEXT("Blocked")){if(S.BlockedSince<0)S.BlockedSince=Now;if(Now-S.BlockedSince>1.2&&!S.bStrafe){Key(EKeys::D,IE_Pressed);S.bStrafe=true;S.SideStepUntil=Now+.7;}}
        else S.BlockedSince=-1;
        if(S.bStrafe&&Now>S.SideStepUntil){Key(EKeys::D,IE_Released,0.f);S.bStrafe=false;S.BlockedSince=-1;}
        if(InPhase>150){Finish(TEXT("failed"),TEXT("could not reach the chosen person"));return false;}
        return true; }
    case 2: // talk through the ordinary prompt
        if(InPhase<.3)return true;
        if(!B->bDialogueOpen){if(GiveUpOnTarget(B,Pawn))return S.bRunning;if(B->TalkTargetBody!=S.Target){Next(1);return true;}if(FMath::Fmod(InPhase,1.5)<0.05||InPhase<.35)Tap(EKeys::E);if(InPhase>10){Finish(TEXT("failed"),TEXT("conversation did not open"));return false;}return true;}
        S.LastDialogue=FString::Join(B->DialogueLines,TEXT(" / "));Step(TEXT("talking"),B);S.Choice=0;Next(3);return true;
    case 3: { // choose replies by their shown labels, with the number keys the dialogue offers
        if(InPhase<.8)return true;
        // After a reply, wait for the conversation to actually move on (the server's next options),
        // however long the round trip takes, rather than reading the old menu or an empty one.
        if(S.Choice>0&&B->bDialogueOpen&&FString::Join(B->DialogueOptionLabels,TEXT("/"))==S.OptionsAtChoice&&InPhase<4)return true;
        if(S.Choice>0&&!B->bDialogueOpen){if(S.bNearest&&S.Asked.Num()<8){S.Asked.Add(S.Target);Next(8);return true;}Finish(TEXT("failed"),TEXT("the conversation ended"));return false;}
        if(S.Choice>=S.Picks.Num()){SlateKey(EKeys::Escape);Next(4);return true;}
        TArray<FString> Alternatives;S.Picks[S.Choice].ParseIntoArray(Alternatives,TEXT("|"));int32 Index=INDEX_NONE;
        for(int32 I=0;I<B->DialogueOptionLabels.Num()&&Index==INDEX_NONE;++I)for(const FString& A:Alternatives)if(B->DialogueOptionLabels[I].StartsWith(A)){Index=I;break;}
        if(Index==INDEX_NONE||Index>8){auto J=MakeShared<FJsonObject>();J->SetStringField(TEXT("wanted"),S.Picks[S.Choice]);J->SetStringField(TEXT("offered"),FString::Join(B->DialogueOptionLabels,TEXT(" / ")));J->SetStringField(TEXT("speaker"),B->DialogueSpeaker);Step(TEXT("reply-unavailable"),B,J);
            // Nobody owes us a sale: say goodbye and ask someone else, as a player would.
            if(S.bNearest&&S.Asked.Num()<8){S.Asked.Add(S.Target);Goodbye(B);Next(8);return true;}
            Finish(TEXT("failed"),TEXT("wanted reply not offered"));return false;}
        const FString Label=B->DialogueOptionLabels[Index];SlateKey(FKey(*FString::Printf(TEXT("%s"),*TArray<FString>{TEXT("One"),TEXT("Two"),TEXT("Three"),TEXT("Four"),TEXT("Five"),TEXT("Six"),TEXT("Seven"),TEXT("Eight"),TEXT("Nine")}[Index])));
        auto J=MakeShared<FJsonObject>();J->SetStringField(TEXT("chose"),Label);J->SetStringField(TEXT("offered"),FString::Join(B->DialogueOptionLabels,TEXT(" / ")));
        S.OptionsAtChoice=FString::Join(B->DialogueOptionLabels,TEXT("/"));
        ++S.Choice;S.PhaseAt=Now;Step(FString::Printf(TEXT("reply-%d"),S.Choice),B,J);return true; }
    case 4: // conversation closed: open the inventory with its key
        if(InPhase<.6)return true;
        if(B->bDialogueOpen){if(InPhase>4){SlateKey(EKeys::Escape);S.PhaseAt=Now;}return true;}
        {auto J=MakeShared<FJsonObject>();J->SetStringField(TEXT("replies"),S.LastDialogue);Step(TEXT("conversation-closed"),B,J);}
        Tap(EKeys::I);Next(5);return true;
    case 5: { // the inventory as projected; press Enter on the focused (first) available action
        if(InPhase<1.2)return true;
        auto J=MakeShared<FJsonObject>();TArray<TSharedPtr<FJsonValue>> Rows;
        for(const auto& Item:B->CarriedRows){FString Acts;for(const auto& A:Item.Actions)Acts+=A.Label+(A.bAvailable?TEXT(""):TEXT(" [")+A.Reason+TEXT("]"))+TEXT("; ");Rows.Add(MakeShared<FJsonValueString>(Item.Label+TEXT(" :: ")+FString::Join(Item.Description,TEXT(", "))+TEXT(" :: ")+Acts));}
        J->SetArrayField(TEXT("rows"),Rows);Step(TEXT("inventory"),B,J);
        if(S.bObserveOnly||!S.bEat){SlateKey(EKeys::Escape);Next(7);return true;}
        const FTVUIActionRow* First=nullptr;for(const auto& Item:B->CarriedRows){for(const auto& A:Item.Actions)if(A.bAvailable){First=&A;break;}if(First)break;}
        if(!First||First->Kind!=TEXT("eat")){Finish(TEXT("failed"),TEXT("no food to eat was offered first"));return false;}
        SlateKey(EKeys::Enter);Next(6);return true; }
    case 6: { // the result, seen where it happened
        if(InPhase<2.5)return true;
        auto J=MakeShared<FJsonObject>();J->SetNumberField(TEXT("hungerBefore"),S.HungerBefore);J->SetNumberField(TEXT("hungerAfter"),Number(B->PlayerVitals,TEXT("Hunger")));
        J->SetNumberField(TEXT("silverBefore"),S.WealthBefore);J->SetNumberField(TEXT("silverAfter"),Silver(B->PlayerVitals));Step(TEXT("ate"),B,J);
        SlateKey(EKeys::Escape);Next(7);return true; }
    case 7:
        if(InPhase<1)return true;Step(TEXT("done"),B);Finish(TEXT("passed"));return false;
    case 8: // closed a conversation that offered nothing we wanted; choose the next person
        if(InPhase<.8)return true;if(B->bDialogueOpen){if(InPhase>3){Goodbye(B);S.PhaseAt=Now;}return true;}
        if(!ChooseTarget(B,Pawn)){if(S.Waypoint<S.Explore.Num()){Next(9);return true;}Finish(TEXT("failed"),TEXT("nobody nearby offered what we wanted"));return false;}
        Next(1);return true;
    case 9: { // nobody new in view: walk on through the settlement's public places, looking about
        if(S.Waypoint>=S.Explore.Num()){Release();Finish(TEXT("failed"),TEXT("walked the whole route; nobody offered what we wanted"));return false;}
        const FVector2D& P=S.Explore[S.Waypoint];const FVector Goal=B->ToUnreal(FVector(P.X,0,P.Y));
        const FVector To=Goal-Pawn->GetActorLocation();const float Error=FMath::FindDeltaAngleDegrees(PC->GetControlRotation().Yaw,To.Rotation().Yaw);
        if(FMath::Abs(Error)>1.5f)Key(EKeys::MouseX,IE_Axis,FMath::Clamp(Error*2.f,-60.f,60.f));
        if(!S.bForward){Key(EKeys::W,IE_Pressed);S.bForward=true;}
        if(To.Size2D()<140){++S.Waypoint;if(!S.ExploreLabels[S.Waypoint-1].IsEmpty()){Release();auto J=MakeShared<FJsonObject>();J->SetStringField(TEXT("reached"),S.ExploreLabels[S.Waypoint-1]);Step(TEXT("arrived"),B,J);}}
        if(FMath::Fmod(InPhase,1.0)<0.02&&ChooseTarget(B,Pawn)){Release();Next(1);return true;}
        if(InPhase>240){Release();Finish(TEXT("failed"),TEXT("could not walk the route"));return false;}
        return true; }
    }
    return true;
}
static void Start(const TArray<FString>& Args){
    if(S.bRunning||Args.Num()<1)return;FString Text;if(!FFileHelper::LoadFileToString(Text,*Args[0])){UE_LOG(LogTemp,Error,TEXT("TV_JOURNEY missing config %s"),*Args[0]);return;}
    TSharedPtr<FJsonObject> C;if(!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),C)||!C){UE_LOG(LogTemp,Error,TEXT("TV_JOURNEY bad config"));return;}
    S=FState();C->TryGetStringField(TEXT("out"),S.Out);C->TryGetStringField(TEXT("targetBody"),S.TargetBody);C->TryGetBoolField(TEXT("eat"),S.bEat);C->TryGetBoolField(TEXT("quit"),S.bQuit);C->TryGetBoolField(TEXT("observeOnly"),S.bObserveOnly);C->TryGetNumberField(TEXT("timeoutSeconds"),S.Timeout);
    const TArray<TSharedPtr<FJsonValue>>* Picks=nullptr;if(C->TryGetArrayField(TEXT("dialogue"),Picks))for(const auto& P:*Picks)S.Picks.Add(P->AsString());
    const TArray<TSharedPtr<FJsonValue>>* Route=nullptr;
    if(C->TryGetArrayField(TEXT("explore"),Route))for(const auto& V:*Route){const auto P=V->AsObject();if(!P)continue;S.Explore.Add(FVector2D(P->GetNumberField(TEXT("x")),P->GetNumberField(TEXT("z"))));FString L;P->TryGetStringField(TEXT("label"),L);S.ExploreLabels.Add(L);}
    S.bNearest=S.TargetBody==TEXT("nearest");IFileManager::Get().MakeDirectory(*S.Out,true);S.bRunning=true;S.Started=FPlatformTime::Seconds();Next(0);
    S.Ticker=FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateStatic(&Tick));UE_LOG(LogTemp,Display,TEXT("TV_JOURNEY start target=%s picks=%d"),*S.TargetBody,S.Picks.Num());
}
static FAutoConsoleCommand Command(TEXT("TV.JourneyProbe"),TEXT("Bounded automated ordinary-input journey from a JSON config; writes journey.json and frames, then quits"),FConsoleCommandWithArgsDelegate::CreateStatic(&Start));
}
#endif
