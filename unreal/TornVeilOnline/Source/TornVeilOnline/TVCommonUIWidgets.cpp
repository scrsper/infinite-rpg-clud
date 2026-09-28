#include "TVCommonUIWidgets.h"
#include "Blueprint/WidgetTree.h"
#include "CommonInputModeTypes.h"
#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "Components/SizeBox.h"
#include "Components/ScrollBox.h"
#include "Components/TextBlock.h"
#include "Components/VerticalBox.h"
#include "Components/VerticalBoxSlot.h"
#include "Input/UIActionBindingHandle.h"
#include "Blueprint/WidgetLayoutLibrary.h"
#include "Styling/CoreStyle.h"
#include "TVControlSettings.h"
#include "CommonInputSubsystem.h"
#include "Engine/LocalPlayer.h"

namespace
{
UTextBlock* MakeText(UWidgetTree* T,const FString& V,int32 S=18){auto* W=T->ConstructWidget<UTextBlock>();W->SetText(FText::FromString(V));FSlateFontInfo Font=FCoreStyle::Get().GetFontStyle(TEXT("NormalFont"));Font.Size=S;W->SetFont(Font);return W;}
UTVUICommandButton* MakeButton(UWidgetTree* T,FTVUICommandRequested* Sink,ETVUICommand C,const FString& P,const FString& S,int32 I,const FString& L){auto* W=T->ConstructWidget<UTVUICommandButton>();W->Configure(Sink,C,P,S,I);W->SetLabel(L);return W;}
// A conversation docks to the right so the person being spoken to stays in view (the camera frames
// them left of centre); every other modal is centred.
UWidget* WrapModal(UWidgetTree* T,UWidget* Content,EHorizontalAlignment Align=HAlign_Center){auto* Overlay=T->ConstructWidget<UOverlay>();auto* Border=T->ConstructWidget<UBorder>();Border->SetPadding(FMargin(24.f));Border->SetBrushColor(FLinearColor(0.025f,0.035f,0.05f,0.96f));auto* Size=T->ConstructWidget<USizeBox>();Size->SetWidthOverride(Align==HAlign_Center?760.f:640.f);Size->SetHeightOverride(620.f);auto* Layout=T->ConstructWidget<UVerticalBox>();auto* Scroll=T->ConstructWidget<UScrollBox>(UScrollBox::StaticClass(),TEXT("ContentScroll"));Scroll->SetScrollWhenFocusChanges(EScrollWhenFocusChanges::InstantScroll);Scroll->AddChild(Content);Layout->AddChildToVerticalBox(Scroll)->SetSize(FSlateChildSize(ESlateSizeRule::Fill));auto* Legend=T->ConstructWidget<UTextBlock>(UTextBlock::StaticClass(),TEXT("ControlLegend"));Legend->SetAutoWrapText(true);Layout->AddChildToVerticalBox(Legend);Border->AddChild(Layout);Size->AddChild(Border);auto* Slot=Overlay->AddChildToOverlay(Size);Slot->SetHorizontalAlignment(Align);Slot->SetVerticalAlignment(VAlign_Center);if(Align==HAlign_Right)Slot->SetPadding(FMargin(0.f,0.f,48.f,0.f));return Overlay;}
}

void UTVUICommandButton::Configure(FTVUICommandRequested* InSink,ETVUICommand InCommand,const FString& InPrimary,const FString& InSecondary,int32 InIndex){Sink=InSink;Command=InCommand;Primary=InPrimary;Secondary=InSecondary;Index=InIndex;InitIsFocusable(true);OnClicked.RemoveAll(this);OnClicked.AddDynamic(this,&UTVUICommandButton::HandleClicked);}
void UTVUICommandButton::SetLabel(const FString& Label){if(!LabelText){LabelText=NewObject<UTextBlock>(this);SetContent(LabelText);}LabelText->SetText(FText::FromString(Label));}
TSharedRef<SWidget> UTVUICommandButton::RebuildWidget(){if(!GetContent()){LabelText=NewObject<UTextBlock>(this);SetContent(LabelText);}return Super::RebuildWidget();}
void UTVUICommandButton::SynchronizeProperties(){Super::SynchronizeProperties();}
void UTVUICommandButton::HandleClicked(){if(Sink)Sink->Broadcast(Command,Primary,Secondary,Index);}

UTVCommonActivatableWidget::UTVCommonActivatableWidget(const FObjectInitializer& O):Super(O){bIsBackHandler=true;bAutoRestoreFocus=true;bIsModal=true;}
void UTVCommonActivatableWidget::NativeTick(const FGeometry& G,float Dt){
    Super::NativeTick(G,Dt);if(auto* Legend=Cast<UTextBlock>(GetWidgetFromName(TEXT("ControlLegend")))){
        const FString Family=UTVControlSettings::DeviceFamily(GetOwningLocalPlayer());
        Legend->SetText(FText::FromString(Family==TEXT("Keyboard")?TEXT("Arrows: navigate    Enter: select    Page Up/Down: scroll    Esc: back")
            :Family==TEXT("PlayStation")?TEXT("D-pad: navigate    Right stick: scroll    Cross ×: select    Circle ○: back")
            :TEXT("D-pad: navigate    Right stick: scroll    A: select    B: back")));
    }
}
FReply UTVCommonActivatableWidget::NativeOnAnalogValueChanged(const FGeometry& G,const FAnalogInputEvent& E){
    if(E.GetKey()==EKeys::Gamepad_RightY){if(auto* Scroll=Cast<UScrollBox>(GetWidgetFromName(TEXT("ContentScroll"))))Scroll->SetScrollOffset(FMath::Max(0.f,Scroll->GetScrollOffset()-UTVControlSettings::Stick(E.GetAnalogValue(),.15f)*22.f));return FReply::Handled();}
    return Super::NativeOnAnalogValueChanged(G,E);
}
void UTVCommonActivatableWidget::SetCommandDelegate(FTVUICommandRequested* InDelegate){
    CommandDelegate=InDelegate;
    // CommonUI's pooled widget can build before AddWidget's initialization callback.
    // Attach the current sink to existing buttons too, including Empty/Back and Resume.
    if(WidgetTree)WidgetTree->ForEachWidget([&](UWidget* W){if(auto* B=Cast<UTVUICommandButton>(W))B->SetCommandSink(InDelegate);});
}
bool UTVCommonActivatableWidget::NativeOnHandleBackAction(){if(CommandDelegate)CommandDelegate->Broadcast(ETVUICommand::Back,FString(),FString(),INDEX_NONE);else DeactivateWidget();return true;}
FReply UTVCommonActivatableWidget::NativeOnKeyDown(const FGeometry& G,const FKeyEvent& E){const FKey K=E.GetKey();if(K==EKeys::PageUp||K==EKeys::PageDown){if(auto* Scroll=Cast<UScrollBox>(GetWidgetFromName(TEXT("ContentScroll"))))Scroll->SetScrollOffset(FMath::Max(0.f,Scroll->GetScrollOffset()+(K==EKeys::PageDown?280.f:-280.f)));return FReply::Handled();}if(K==EKeys::Escape||K==EKeys::Gamepad_FaceButton_Right){NativeOnHandleBackAction();return FReply::Handled();}return Super::NativeOnKeyDown(G,E);}
UWidget* UTVCommonActivatableWidget::NativeGetDesiredFocusTarget() const{return nullptr;}
TOptional<FUIInputConfig> UTVCommonActivatableWidget::GetDesiredInputConfig()const{return FUIInputConfig(ECommonInputMode::Menu,EMouseCaptureMode::NoCapture);}

TSharedRef<SWidget> UTVInteractionPromptWidget::RebuildWidget(){
    Canvas=WidgetTree->ConstructWidget<UCanvasPanel>();WidgetTree->RootWidget=Canvas;
    for(int32 I=0;I<4;++I){auto* Edge=WidgetTree->ConstructWidget<UBorder>();Edge->SetBrushColor(FLinearColor(1.f,.75f,.1f,0.9f));Edge->SetVisibility(ESlateVisibility::Collapsed);FocusEdges.Add(Edge);Canvas->AddChildToCanvas(Edge)->SetZOrder(-1);}
    PromptButton=WidgetTree->ConstructWidget<UTVUICommandButton>();PromptButton->Configure(CommandDelegate,ETVUICommand::Interact,FString(),FString(),INDEX_NONE);
    PromptText=MakeText(WidgetTree,TEXT(""));PromptButton->AddChild(PromptText);
    auto* PromptSlot=Canvas->AddChildToCanvas(PromptButton);PromptSlot->SetAnchors(FAnchors(.5f,1.f));PromptSlot->SetAlignment(FVector2D(.5f,1.f));PromptSlot->SetAutoSize(true);PromptSlot->SetPosition(FVector2D(0.f,-72.f));
    ActionGlyph=WidgetTree->ConstructWidget<UCommonActionWidget>();auto* GlyphSlot=Canvas->AddChildToCanvas(ActionGlyph);GlyphSlot->SetAnchors(FAnchors(.5f,1.f));GlyphSlot->SetAlignment(FVector2D(0.f,1.f));GlyphSlot->SetAutoSize(true);GlyphSlot->SetPosition(FVector2D(180.f,-72.f));
    return Super::RebuildWidget();
}
void UTVInteractionPromptWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVInteractionPromptWidget::SetInteractAction(UInputAction* InAction){InteractAction=InAction;if(ActionGlyph)ActionGlyph->SetEnhancedInputAction(InAction);}
void UTVInteractionPromptWidget::SetSnapshot(const FTVUISnapshot& S){if(!PromptText)return;const FString Glyph=UTVControlSettings::Glyph(GetOwningLocalPlayer(),TEXT("Interact"));
    // A person gets a name plate over their head: the name, then "[E] Talk" or why they cannot talk now.
    const bool bPlate=S.bFocusedPerson&&!S.FocusedTitle.IsEmpty()&&S.FocusedBounds.bHasFocusBounds;
    if(bPlate){const FString Line2=S.FocusedReason.IsEmpty()?FString::Printf(TEXT("[%s] %s"),*Glyph,*(S.FocusedVerb.IsEmpty()?FString(TEXT("Talk")):S.FocusedVerb)):S.FocusedReason;PromptText->SetText(FText::FromString(S.FocusedTitle+LINE_TERMINATOR+Line2));PromptText->SetJustification(ETextJustify::Center);SetVisibility(ESlateVisibility::Visible);
        if(auto* B=Cast<UTVUICommandButton>(PromptButton))B->Configure(CommandDelegate,ETVUICommand::Interact,S.FocusedTargetId,S.FocusedActionId,INDEX_NONE);if(ActionGlyph)ActionGlyph->SetVisibility(ESlateVisibility::Collapsed);for(UBorder* Edge:FocusEdges)if(Edge)Edge->SetVisibility(ESlateVisibility::Collapsed);
        const float Scale=FMath::Max(0.01f,UWidgetLayoutLibrary::GetViewportScale(this));const FVector2D Min=S.FocusedBounds.BoundsPixels.Min/Scale,Max=S.FocusedBounds.BoundsPixels.Max/Scale;
        if(auto* PS=Cast<UCanvasPanelSlot>(PromptButton->Slot)){PS->SetAnchors(FAnchors(0.f,0.f));PS->SetAlignment(FVector2D(.5f,1.f));PS->SetPosition(S.FocusedBounds.bHasAnchor?FVector2D(S.FocusedBounds.AnchorPixels.X/Scale,FMath::Max(64.f,S.FocusedBounds.AnchorPixels.Y/Scale)):FVector2D((Min.X+Max.X)*.5f,FMath::Max(64.f,Min.Y-10.f)));}return;}
    if(auto* PS=Cast<UCanvasPanelSlot>(PromptButton->Slot)){PS->SetAnchors(FAnchors(.5f,1.f));PS->SetAlignment(FVector2D(.5f,1.f));PS->SetPosition(FVector2D(0.f,-72.f));}PromptText->SetJustification(ETextJustify::Left);
    const FString L=S.FocusedLabel.IsEmpty()?FString():FString::Printf(TEXT("[%s] %s"),*Glyph,*S.FocusedLabel);PromptText->SetText(FText::FromString(L));SetVisibility(L.IsEmpty()?ESlateVisibility::Collapsed:ESlateVisibility::Visible);if(auto* B=Cast<UTVUICommandButton>(PromptButton))B->Configure(CommandDelegate,ETVUICommand::Interact,S.FocusedTargetId,S.FocusedActionId,INDEX_NONE);if(ActionGlyph)ActionGlyph->SetVisibility(InteractAction&&ActionGlyph->GetIcon().GetResourceObject()?ESlateVisibility::Visible:ESlateVisibility::Collapsed);const float Scale=FMath::Max(0.01f,UWidgetLayoutLibrary::GetViewportScale(this));for(UBorder* Edge:FocusEdges)if(Edge){Edge->SetVisibility(S.FocusedBounds.bHasFocusBounds?ESlateVisibility::Visible:ESlateVisibility::Collapsed);}if(S.FocusedBounds.bHasFocusBounds){const FVector2D Min=S.FocusedBounds.BoundsPixels.Min/Scale;const FVector2D Max=S.FocusedBounds.BoundsPixels.Max/Scale;const FVector2D Size=Max-Min;const float T=2.f;const FVector2D Positions[4]={Min,FVector2D(Min.X,Max.Y-T),FVector2D(Min.X,Min.Y),FVector2D(Max.X-T,Min.Y)};const FVector2D Sizes[4]={FVector2D(Size.X,T),FVector2D(Size.X,T),FVector2D(T,Size.Y),FVector2D(T,Size.Y)};for(int32 I=0;I<4&&I<FocusEdges.Num();++I)if(auto* EdgeSlot=Cast<UCanvasPanelSlot>(FocusEdges[I]->Slot)){EdgeSlot->SetPosition(Positions[I]);EdgeSlot->SetSize(Sizes[I]);}}}

TSharedRef<SWidget> UTVDialogueWidget::RebuildWidget(){Body=WidgetTree->ConstructWidget<UVerticalBox>();WidgetTree->RootWidget=WrapModal(WidgetTree,Body,HAlign_Right);Rebuild();return Super::RebuildWidget();}
FReply UTVDialogueWidget::NativeOnKeyDown(const FGeometry& G,const FKeyEvent& E){
    const TArray<FKey> Keys={EKeys::One,EKeys::Two,EKeys::Three,EKeys::Four,EKeys::Five,EKeys::Six,EKeys::Seven,EKeys::Eight,EKeys::Nine};
    const TArray<FKey> PadKeys={EKeys::NumPadOne,EKeys::NumPadTwo,EKeys::NumPadThree,EKeys::NumPadFour,EKeys::NumPadFive,EKeys::NumPadSix,EKeys::NumPadSeven,EKeys::NumPadEight,EKeys::NumPadNine};
    int32 I=Keys.IndexOfByKey(E.GetKey());if(I==INDEX_NONE)I=PadKeys.IndexOfByKey(E.GetKey());
    if(Snapshot.DialogueOptionIds.IsValidIndex(I)){
        if(!E.IsRepeat()&&CommandDelegate)CommandDelegate->Broadcast(ETVUICommand::DialogueChoice,Snapshot.DialogueOptionIds[I],FString(),I);
        return FReply::Handled();
    }
    return Super::NativeOnKeyDown(G,E);
}
void UTVDialogueWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVDialogueWidget::SetSnapshot(const FTVUISnapshot& S){Snapshot=S;Rebuild();}
void UTVDialogueWidget::Rebuild(){if(!Body)return;if(!SpeakerText||ChoiceButtons.Num()!=Snapshot.DialogueOptionLabels.Num()||LineTexts.Num()!=Snapshot.DialogueLines.Num()){Body->ClearChildren();ChoiceButtons.Reset();LineTexts.Reset();SpeakerText=MakeText(WidgetTree,Snapshot.DialogueSpeaker+(Snapshot.DialogueOccupation.IsEmpty()?FString():TEXT(" / ")+Snapshot.DialogueOccupation),24);Body->AddChildToVerticalBox(SpeakerText);for(const FString& L:Snapshot.DialogueLines){auto* T=MakeText(WidgetTree,L);T->SetAutoWrapText(true);LineTexts.Add(T);Body->AddChildToVerticalBox(T);}for(int32 I=0;I<Snapshot.DialogueOptionLabels.Num();++I)AddChoice(I,Snapshot.DialogueOptionIds.IsValidIndex(I)?Snapshot.DialogueOptionIds[I]:FString(),Snapshot.DialogueOptionLabels[I]);Body->AddChildToVerticalBox(MakeButton(WidgetTree,CommandDelegate,ETVUICommand::Back,FString(),FString(),INDEX_NONE,TEXT("Close conversation")));}else{SpeakerText->SetText(FText::FromString(Snapshot.DialogueSpeaker+(Snapshot.DialogueOccupation.IsEmpty()?FString():TEXT(" / ")+Snapshot.DialogueOccupation)));for(int32 I=0;I<LineTexts.Num();++I)LineTexts[I]->SetText(FText::FromString(Snapshot.DialogueLines[I]));}for(int32 I=0;I<ChoiceButtons.Num();++I){ChoiceButtons[I]->Configure(CommandDelegate,ETVUICommand::DialogueChoice,Snapshot.DialogueOptionIds.IsValidIndex(I)?Snapshot.DialogueOptionIds[I]:FString(),FString(),I);ChoiceButtons[I]->SetLabel(I<9?FString::Printf(TEXT("%d  %s"),I+1,*Snapshot.DialogueOptionLabels[I]):Snapshot.DialogueOptionLabels[I]);}}
void UTVDialogueWidget::AddChoice(int32 I,const FString& Id,const FString& Label){auto* W=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::DialogueChoice,Id,FString(),I,Label);ChoiceButtons.Add(W);Body->AddChildToVerticalBox(W);}
UWidget* UTVDialogueWidget::NativeGetDesiredFocusTarget() const{return ChoiceButtons.Num()?ChoiceButtons[0]:nullptr;}

TSharedRef<SWidget> UTVInventoryWidget::RebuildWidget(){Body=WidgetTree->ConstructWidget<UVerticalBox>();WidgetTree->RootWidget=WrapModal(WidgetTree,Body);Rebuild();return Super::RebuildWidget();}
void UTVInventoryWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVInventoryWidget::SetSnapshot(const FTVUISnapshot& S){Snapshot=S;Rebuild();}
namespace
{
/** A projected row the player cannot use right now: said plainly, not offered as a button. */
UTextBlock* MakeRefusal(UWidgetTree* T,const FTVUIActionRow& A){auto* W=MakeText(T,TEXT("      ")+A.Label+(A.Reason.IsEmpty()?FString():TEXT(" — ")+A.Reason),15);W->SetColorAndOpacity(FSlateColor(FLinearColor(.58f,.58f,.6f)));W->SetAutoWrapText(true);return W;}
FString ActionText(const FTVUIActionRow& A){return A.Label+(A.Detail.IsEmpty()?FString():TEXT("  (")+A.Detail+TEXT(")"));}
FString RowsSignature(const TArray<FTVUIActionRow>& Rows){FString S;for(const auto& A:Rows)S+=FString::Printf(TEXT("%s:%s:%d:%s:%s|"),*A.Id,*A.Label,A.bAvailable?1:0,*A.Reason,*A.Detail);return S;}
}

void UTVInventoryWidget::Rebuild(){
    if(!Body)return;
    // Every row, description and action comes from the server's projection of canonical rules;
    // nothing here decides what an item can be used for.
    FString Signature;for(const auto& Item:Snapshot.Inventory)Signature+=Item.Id+TEXT("#")+Item.Label+TEXT("#")+FString::Join(Item.Description,TEXT("~"))+TEXT("#")+RowsSignature(Item.Actions)+TEXT(";");
    if(VitalsLine)VitalsLine->SetText(FText::FromString(Snapshot.Vitals));
    if(BackButton&&Signature==BuiltSignature)return;
    BuiltSignature=Signature;Body->ClearChildren();ItemButtons.Reset();
    Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Inventory"),26));
    VitalsLine=MakeText(WidgetTree,Snapshot.Vitals);VitalsLine->SetAutoWrapText(true);Body->AddChildToVerticalBox(VitalsLine);
    if(Snapshot.Inventory.IsEmpty())Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("You are carrying nothing.")));
    for(const auto& Item:Snapshot.Inventory){
        Body->AddChildToVerticalBox(MakeText(WidgetTree,Item.Label,21));
        if(Item.Description.Num()){auto* D=MakeText(WidgetTree,TEXT("   ")+FString::Join(Item.Description,TEXT("  ·  ")),15);D->SetAutoWrapText(true);Body->AddChildToVerticalBox(D);}
        for(const auto& A:Item.Actions){
            if(!A.bAvailable){Body->AddChildToVerticalBox(MakeRefusal(WidgetTree,A));continue;}
            auto* B=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::ItemAction,A.Id,Item.Id,ItemButtons.Num(),TEXT("   ")+ActionText(A));ItemButtons.Add(B);Body->AddChildToVerticalBox(B);
        }
    }
    BackButton=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::Back,FString(),FString(),INDEX_NONE,TEXT("Back"));Body->AddChildToVerticalBox(BackButton);
    if(UWidget* Focus=NativeGetDesiredFocusTarget())Focus->SetFocus();
}
UWidget* UTVInventoryWidget::NativeGetDesiredFocusTarget() const{return ItemButtons.Num()?ItemButtons[0]:BackButton;}

TSharedRef<SWidget> UTVContainerWidget::RebuildWidget(){Body=WidgetTree->ConstructWidget<UVerticalBox>();WidgetTree->RootWidget=WrapModal(WidgetTree,Body);Rebuild();return Super::RebuildWidget();}
void UTVContainerWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVContainerWidget::SetSnapshot(const FTVUISnapshot& S){Snapshot=S;Rebuild();}
void UTVContainerWidget::Rebuild(){if(!Body)return;const int32 InventoryRows=Snapshot.Inventory.Num(),ContainerRows=Snapshot.Container.Num();if(BuiltInventoryRows!=InventoryRows||BuiltContainerRows!=ContainerRows){Body->ClearChildren();ItemButtons.Reset();Body->AddChildToVerticalBox(MakeText(WidgetTree,Snapshot.ContainerName,26));Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Your inventory"),20));if(Snapshot.Inventory.IsEmpty())Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Empty")));for(int32 I=0;I<InventoryRows;++I){const auto& Item=Snapshot.Inventory[I];auto* W=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::TransferItemToContainer,Item.Id,Snapshot.ContainerId,I,FString::Printf(TEXT("%s  [Store]"),*Item.Label));ItemButtons.Add(W);Body->AddChildToVerticalBox(W);}Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Container"),20));if(Snapshot.Container.IsEmpty())Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Empty")));for(int32 I=0;I<ContainerRows;++I)AddItem(I,Snapshot.Container[I]);BackButton=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::Back,FString(),FString(),INDEX_NONE,TEXT("Back"));Body->AddChildToVerticalBox(BackButton);BuiltInventoryRows=InventoryRows;BuiltContainerRows=ContainerRows;if(UWidget* Focus=NativeGetDesiredFocusTarget())Focus->SetFocus();}for(int32 I=0;I<InventoryRows;++I){const auto& Item=Snapshot.Inventory[I];ItemButtons[I]->Configure(CommandDelegate,ETVUICommand::TransferItemToContainer,Item.Id,Snapshot.ContainerId,I);ItemButtons[I]->SetLabel(FString::Printf(TEXT("%s  [Store]"),*Item.Label));}int32 O=InventoryRows;for(int32 I=0;I<ContainerRows;++I){const auto& Item=Snapshot.Container[I];ItemButtons[O+I]->Configure(CommandDelegate,ETVUICommand::TransferItemFromContainer,Item.Id,Snapshot.ContainerId,I);ItemButtons[O+I]->SetLabel(FString::Printf(TEXT("%s  [Take]"),*Item.Label));}}
void UTVContainerWidget::AddItem(int32 I,const FTVUIItemRow& Item){auto* W=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::TransferItemFromContainer,Item.Id,Snapshot.ContainerId,I,FString::Printf(TEXT("%s  [Take]"),*Item.Label));ItemButtons.Add(W);Body->AddChildToVerticalBox(W);}
UWidget* UTVContainerWidget::NativeGetDesiredFocusTarget() const{return ItemButtons.Num()?ItemButtons[0]:BackButton;}

TSharedRef<SWidget> UTVMenuWidget::RebuildWidget(){auto* Body=WidgetTree->ConstructWidget<UVerticalBox>();Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Torn Veil"),28));ResumeButton=MakeButton(WidgetTree,CommandDelegate,ETVUICommand::Back,FString(),FString(),INDEX_NONE,TEXT("Resume"));Body->AddChildToVerticalBox(ResumeButton);for(const FString& Kind:TArray<FString>{TEXT("Journal"),TEXT("Abilities"),TEXT("Settings")})Body->AddChildToVerticalBox(MakeButton(WidgetTree,CommandDelegate,ETVUICommand::OpenPanel,Kind,FString(),INDEX_NONE,Kind));Body->AddChildToVerticalBox(MakeButton(WidgetTree,CommandDelegate,ETVUICommand::SaveWorld,FString(),FString(),INDEX_NONE,TEXT("Save world")));Body->AddChildToVerticalBox(MakeButton(WidgetTree,CommandDelegate,ETVUICommand::SignOut,FString(),FString(),INDEX_NONE,TEXT("Sign out")));Body->AddChildToVerticalBox(MakeButton(WidgetTree,CommandDelegate,ETVUICommand::Quit,FString(),FString(),INDEX_NONE,TEXT("Quit game")));WidgetTree->RootWidget=WrapModal(WidgetTree,Body);return Super::RebuildWidget();}
void UTVMenuWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVMenuWidget::Resume(){DeactivateWidget();if(CommandDelegate)CommandDelegate->Broadcast(ETVUICommand::Back,FString(),FString(),INDEX_NONE);}
UWidget* UTVMenuWidget::NativeGetDesiredFocusTarget() const{return ResumeButton;}

UTVPlayerShellWidget::UTVPlayerShellWidget(const FObjectInitializer& O):Super(O){bSupportsActivationFocus=true;bAutoRestoreFocus=true;}
TOptional<FUIInputConfig> UTVPlayerShellWidget::GetDesiredInputConfig()const{return FUIInputConfig(ECommonInputMode::Game,EMouseCaptureMode::CapturePermanently);}
TSharedRef<SWidget> UTVPlayerShellWidget::RebuildWidget(){RootOverlay=WidgetTree->ConstructWidget<UOverlay>();WidgetTree->RootWidget=RootOverlay;Prompt=WidgetTree->ConstructWidget<UTVInteractionPromptWidget>();Prompt->SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);auto* PromptSlot=RootOverlay->AddChildToOverlay(Prompt);PromptSlot->SetHorizontalAlignment(HAlign_Fill);PromptSlot->SetVerticalAlignment(VAlign_Fill);auto* Status=WidgetTree->ConstructWidget<UVerticalBox>();VitalsText=MakeText(WidgetTree,TEXT(""));RestrictionText=MakeText(WidgetTree,TEXT(""));Status->AddChildToVerticalBox(VitalsText);Status->AddChildToVerticalBox(RestrictionText);auto* StatusSlot=RootOverlay->AddChildToOverlay(Status);StatusSlot->SetHorizontalAlignment(HAlign_Left);StatusSlot->SetVerticalAlignment(VAlign_Bottom);StatusSlot->SetPadding(FMargin(24.f,0.f,0.f,24.f));ModalStack=WidgetTree->ConstructWidget<UCommonActivatableWidgetStack>();ModalStack->OnDisplayedWidgetChanged().AddUObject(this,&UTVPlayerShellWidget::HandleDisplayedWidgetChanged);auto* StackSlot=RootOverlay->AddChildToOverlay(ModalStack);StackSlot->SetHorizontalAlignment(HAlign_Fill);StackSlot->SetVerticalAlignment(VAlign_Fill);return Super::RebuildWidget();}
void UTVPlayerShellWidget::NativeConstruct(){Super::NativeConstruct();}
void UTVPlayerShellWidget::SetCommandDelegate(FTVUICommandRequested* In){CommandSink=In;if(Prompt)Prompt->SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);if(auto* A=ModalStack?ModalStack->GetActiveWidget():nullptr)if(auto* W=Cast<UTVCommonActivatableWidget>(A))W->SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);}
void UTVPlayerShellWidget::SetInputActions(UInputAction* I,UInputAction* B){InteractAction=I;BackAction=B;if(Prompt)Prompt->SetInteractAction(I);}
void UTVPlayerShellWidget::HandleDisplayedWidgetChanged(UCommonActivatableWidget* Widget){ModalChanged.Broadcast(Widget!=nullptr);}
void UTVPlayerShellWidget::SetSnapshot(const FTVUISnapshot& S){Snapshot=S;LastSnapshotRevision=S.Revision;if(VitalsText)VitalsText->SetText(FText::FromString(Snapshot.Vitals));if(RestrictionText)RestrictionText->SetText(FText::FromString(Snapshot.Restriction));if(Prompt)Prompt->SetSnapshot(Snapshot);if(!Snapshot.bDialogueOpen&&ModalStack&&Cast<UTVDialogueWidget>(ModalStack->GetActiveWidget()))CloseTop();RefreshActiveWidget();}
void UTVPlayerShellWidget::RefreshActiveWidget(){if(!ModalStack)return;auto* A=ModalStack->GetActiveWidget();if(auto* Dialogue=Cast<UTVDialogueWidget>(A))Dialogue->SetSnapshot(Snapshot);else if(auto* Inventory=Cast<UTVInventoryWidget>(A))Inventory->SetSnapshot(Snapshot);else if(auto* Container=Cast<UTVContainerWidget>(A))Container->SetSnapshot(Snapshot);else if(auto* Panel=Cast<UTVActionPanelWidget>(A)){Panel->UpdateJournal(Snapshot.Journal);Panel->UpdateAbilities(Snapshot.Abilities);}}
void UTVPlayerShellWidget::OpenInventory(){if(ModalStack)if(auto* W=ModalStack->AddWidget<UTVInventoryWidget>(UTVInventoryWidget::StaticClass(),[this](UTVInventoryWidget& V){V.SetSnapshot(Snapshot);V.SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);}))W->ActivateWidget();}
void UTVPlayerShellWidget::OpenDialogue(){if(ModalStack)if(auto* W=ModalStack->AddWidget<UTVDialogueWidget>(UTVDialogueWidget::StaticClass(),[this](UTVDialogueWidget& V){V.SetSnapshot(Snapshot);V.SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);}))W->ActivateWidget();}
void UTVPlayerShellWidget::OpenContainer(){if(ModalStack&&!Snapshot.ContainerId.IsEmpty())if(auto* W=ModalStack->AddWidget<UTVContainerWidget>(UTVContainerWidget::StaticClass(),[this](UTVContainerWidget& V){V.SetSnapshot(Snapshot);V.SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);}))W->ActivateWidget();}
void UTVPlayerShellWidget::OpenMenu(){if(ModalStack)if(auto* W=ModalStack->AddWidget<UTVMenuWidget>(UTVMenuWidget::StaticClass(),[this](UTVMenuWidget& V){V.SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);}))W->ActivateWidget();}
void UTVPlayerShellWidget::OpenActionPanel(const FString& Kind){
    if(ModalStack)if(auto* W=ModalStack->AddWidget<UTVActionPanelWidget>(UTVActionPanelWidget::StaticClass(),[this,&Kind](UTVActionPanelWidget& V){V.SetCommandDelegate(CommandSink?CommandSink:&CommandRequested);V.UpdateAbilities(Snapshot.Abilities);V.Configure(Kind,Snapshot.Journal);}))W->ActivateWidget();
}
void UTVPlayerShellWidget::BeginRebind(const FString& Action){if(ModalStack)if(auto* W=Cast<UTVActionPanelWidget>(ModalStack->GetActiveWidget()))W->BeginRebind(Action);}
void UTVPlayerShellWidget::CloseTop(){if(ModalStack&&ModalStack->GetActiveWidget())ModalStack->GetActiveWidget()->DeactivateWidget();}
bool UTVPlayerShellWidget::HasModalScreen()const{return ModalStack&&ModalStack->GetActiveWidget()!=nullptr;}

void UTVActionPanelWidget::Configure(const FString& InKind,const FString& InText){Kind=InKind;Text=InText;BuildPanel();}
TSharedRef<SWidget> UTVActionPanelWidget::RebuildWidget(){
    Body=WidgetTree->ConstructWidget<UVerticalBox>();WidgetTree->RootWidget=WrapModal(WidgetTree,Body);BuildPanel();return Super::RebuildWidget();
}
UWidget* UTVActionPanelWidget::NativeGetDesiredFocusTarget() const{return FirstButton;}
void UTVActionPanelWidget::BuildPanel(){
    if(!Body)return;Body->ClearChildren();FirstButton=nullptr;
    Body->AddChildToVerticalBox(MakeText(WidgetTree,Kind,26));Description=MakeText(WidgetTree,Kind==TEXT("Settings")?GetDefault<UTVControlSettings>()->Describe():Kind==TEXT("Journal")?Text:TEXT("What your body and what you have learned let you do now. A greyed line says what stands in the way."));Description->SetAutoWrapText(true);Body->AddChildToVerticalBox(Description);
    const auto Add=[&](ETVUICommand C,const FString& Id,const FString& Label){auto* B=MakeButton(WidgetTree,CommandDelegate,C,Id,FString(),INDEX_NONE,Label);Body->AddChildToVerticalBox(B);if(!FirstButton)FirstButton=B;};
    if(Kind==TEXT("Settings")){
        for(const FString& K:TArray<FString>{TEXT("Mouse"),TEXT("ControllerX"),TEXT("ControllerY"),TEXT("MoveDeadZone"),TEXT("LookDeadZone"),TEXT("InvertY"),TEXT("Vibration"),TEXT("SprintToggle"),TEXT("FocusToggle")})Add(ETVUICommand::Setting,K,TEXT("Adjust ")+FName::NameToDisplayString(K,false));
        Body->AddChildToVerticalBox(MakeText(WidgetTree,TEXT("Select an action, then press its new key or controller button. Conflicts swap. Escape cancels.")));
        for(const FString& K:TArray<FString>{TEXT("MoveForward"),TEXT("MoveBack"),TEXT("MoveLeft"),TEXT("MoveRight"),TEXT("Interact"),TEXT("Sprint"),TEXT("WalkToggle"),TEXT("Crouch"),TEXT("LightAttack"),TEXT("HeavyAttack"),TEXT("Guard"),TEXT("Focus"),TEXT("Dodge"),TEXT("LockTarget"),TEXT("SwitchTarget"),TEXT("PrimaryAbility"),TEXT("QuickItem"),TEXT("AbilityWheel"),TEXT("Inventory"),TEXT("Journal")})Add(ETVUICommand::Rebind,K,TEXT("Rebind ")+FName::NameToDisplayString(K,false));
    }else{
        // Only what this person has actually learned and can attempt, as the server projects it.
        for(const auto& A:Abilities){if(A.bAvailable)Add(ETVUICommand::PersonAction,A.Kind,ActionText(A));else Body->AddChildToVerticalBox(MakeRefusal(WidgetTree,A));}
        Add(ETVUICommand::PersonAction,TEXT("crouch"),TEXT("Crouch / stand"));
    }
    Add(ETVUICommand::Back,TEXT(""),TEXT("Back"));
}
void UTVActionPanelWidget::NativeTick(const FGeometry& G,float Dt){Super::NativeTick(G,Dt);if(Description&&Kind==TEXT("Settings"))Description->SetText(FText::FromString(AwaitingBinding.IsEmpty()?GetDefault<UTVControlSettings>()->Describe():TEXT("Press new input for ")+AwaitingBinding+TEXT(" (Escape cancels)")));}
FReply UTVActionPanelWidget::NativeOnPreviewKeyDown(const FGeometry& G,const FKeyEvent& E){
    if(!AwaitingBinding.IsEmpty()){
        const FString Action=AwaitingBinding;AwaitingBinding.Empty();
        if(E.GetKey()!=EKeys::Escape&&CommandDelegate)CommandDelegate->Broadcast(ETVUICommand::Rebind,Action,E.GetKey().GetFName().ToString(),0);
        return FReply::Handled();
    }
    return Super::NativeOnPreviewKeyDown(G,E);
}

FReply UTVActionPanelWidget::NativeOnPreviewMouseButtonDown(const FGeometry& G,const FPointerEvent& E){
    if(!AwaitingBinding.IsEmpty()){
        const FString Action=AwaitingBinding;AwaitingBinding.Empty();
        if(CommandDelegate)CommandDelegate->Broadcast(ETVUICommand::Rebind,Action,E.GetEffectingButton().GetFName().ToString(),0);
        return FReply::Handled();
    }
    return Super::NativeOnPreviewMouseButtonDown(G,E);
}

void UTVActionPanelWidget::UpdateAbilities(const TArray<FTVUIActionRow>& Rows){
    const FString Signature=RowsSignature(Rows);if(Signature==AbilitySignature)return;
    AbilitySignature=Signature;Abilities=Rows;
    if(Body&&Kind!=TEXT("Settings")&&AwaitingBinding.IsEmpty()){BuildPanel();if(FirstButton)FirstButton->SetFocus();}
}
void UTVActionPanelWidget::UpdateJournal(const FString& Value){if(Kind==TEXT("Journal")){Text=Value;if(Description)Description->SetText(FText::FromString(Value));}}
