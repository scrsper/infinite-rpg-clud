#pragma once

#include "CoreMinimal.h"
#include "CommonActivatableWidget.h"
#include "Widgets/CommonActivatableWidgetContainer.h"
#include "CommonActionWidget.h"
#include "CommonUserWidget.h"
#include "Components/Button.h"
#include "InputAction.h"
#include "TVCommonUIWidgets.generated.h"

UENUM(BlueprintType)
enum class ETVUICommand : uint8
{
    Interact,
    DialogueChoice,
    DropItem,
    TransferItemToContainer,
    TransferItemFromContainer,
    EatItem,
    Back,
    Pause,
    SaveWorld,
    OpenPanel,
    PersonAction,
    Setting,
    Rebind,
    SignOut,
    Quit,
    /** A projected carried-item or ability row: Primary = row action id, Secondary = item id. */
    ItemAction,
};

/** One thing the player may do, as the server projected it. Availability is advisory: the server
 *  revalidates on execution. An unavailable row carries a reason the character can know. */
USTRUCT(BlueprintType)
struct TORNVEILONLINE_API FTVUIActionRow
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString Id;
    UPROPERTY(BlueprintReadOnly) FString Kind;
    UPROPERTY(BlueprintReadOnly) FString Label;
    UPROPERTY(BlueprintReadOnly) FString Detail;
    UPROPERTY(BlueprintReadOnly) bool bAvailable = false;
    UPROPERTY(BlueprintReadOnly) FString Reason;
    /** "interact" (RequestKey = interaction id), "person_action" (RequestKey = intent kind) or empty. */
    UPROPERTY(BlueprintReadOnly) FString RequestType;
    UPROPERTY(BlueprintReadOnly) FString RequestKey;
    UPROPERTY(BlueprintReadOnly) FString ItemId;
};

USTRUCT(BlueprintType)
struct TORNVEILONLINE_API FTVUIItemRow
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString Id;
    UPROPERTY(BlueprintReadOnly) FString Label;
    UPROPERTY(BlueprintReadOnly) double Quantity = 0.0;
    UPROPERTY(BlueprintReadOnly) TArray<FString> Description;
    UPROPERTY(BlueprintReadOnly) TArray<FTVUIActionRow> Actions;
};

USTRUCT(BlueprintType)
struct TORNVEILONLINE_API FTVUIFocusBounds
{
    GENERATED_BODY()
    UPROPERTY(BlueprintReadOnly) bool bHasFocusBounds = false;
    UPROPERTY(BlueprintReadOnly) FBox2D BoundsPixels = FBox2D(ForceInit);
    /** A person: the screen point just above their drawn head, where the name plate sits. */
    UPROPERTY(BlueprintReadOnly) bool bHasAnchor = false;
    UPROPERTY(BlueprintReadOnly) FVector2D AnchorPixels = FVector2D::ZeroVector;
    /** The same point in the world, projected again each UI frame after the camera has moved. */
    UPROPERTY(BlueprintReadOnly) FVector AnchorWorld = FVector::ZeroVector;
};

USTRUCT(BlueprintType)
struct TORNVEILONLINE_API FTVUISnapshot
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) int32 Revision = 0;
    UPROPERTY(BlueprintReadOnly) FString FocusedLabel;
    /** A person: name, then the verb ([E] Talk) or why they cannot talk now. */
    UPROPERTY(BlueprintReadOnly) FString FocusedTitle;
    UPROPERTY(BlueprintReadOnly) FString FocusedVerb;
    UPROPERTY(BlueprintReadOnly) FString FocusedReason;
    UPROPERTY(BlueprintReadOnly) bool bFocusedPerson = false;
    UPROPERTY(BlueprintReadOnly) FString FocusedTargetId;
    UPROPERTY(BlueprintReadOnly) FString FocusedActionId;
    UPROPERTY(BlueprintReadOnly) FTVUIFocusBounds FocusedBounds;
    UPROPERTY(BlueprintReadOnly) FString Vitals;
    UPROPERTY(BlueprintReadOnly) FString Restriction;
    UPROPERTY(BlueprintReadOnly) FString Journal;
    UPROPERTY(BlueprintReadOnly) TArray<FTVUIItemRow> Inventory;
    UPROPERTY(BlueprintReadOnly) TArray<FTVUIActionRow> Abilities;
    UPROPERTY(BlueprintReadOnly) FString ContainerId;
    UPROPERTY(BlueprintReadOnly) FString ContainerName;
    UPROPERTY(BlueprintReadOnly) TArray<FTVUIItemRow> Container;
    UPROPERTY(BlueprintReadOnly) bool bDialogueOpen = false;
    UPROPERTY(BlueprintReadOnly) FString DialogueSpeaker;
    UPROPERTY(BlueprintReadOnly) FString DialogueOccupation;
    UPROPERTY(BlueprintReadOnly) TArray<FString> DialogueLines;
    UPROPERTY(BlueprintReadOnly) TArray<FString> DialogueOptionIds;
    UPROPERTY(BlueprintReadOnly) TArray<FString> DialogueOptionLabels;
};

DECLARE_MULTICAST_DELEGATE_FourParams(FTVUICommandRequested, ETVUICommand, const FString&, const FString&, int32);
DECLARE_MULTICAST_DELEGATE_OneParam(FTVModalChanged, bool);

UCLASS()
class TORNVEILONLINE_API UTVUICommandButton : public UButton
{
    GENERATED_BODY()
public:
    void Configure(FTVUICommandRequested* InSink, ETVUICommand InCommand, const FString& InPrimary, const FString& InSecondary, int32 InIndex);
    void SetLabel(const FString& Label);
    void SetCommandSink(FTVUICommandRequested* InSink) { Sink = InSink; }
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void SynchronizeProperties() override;
    UFUNCTION() void HandleClicked();
    FTVUICommandRequested* Sink = nullptr;
    ETVUICommand Command = ETVUICommand::Back;
    FString Primary;
    FString Secondary;
    int32 Index = INDEX_NONE;
    UPROPERTY() class UTextBlock* LabelText = nullptr;
};

UCLASS(Abstract, Blueprintable)
class TORNVEILONLINE_API UTVCommonActivatableWidget : public UCommonActivatableWidget
{
    GENERATED_BODY()
public:
    UTVCommonActivatableWidget(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());
    virtual bool NativeOnHandleBackAction() override;
    virtual FReply NativeOnAnalogValueChanged(const FGeometry&,const FAnalogInputEvent&) override;
    virtual FReply NativeOnKeyDown(const FGeometry& InGeometry, const FKeyEvent& InKeyEvent) override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    virtual TOptional<FUIInputConfig> GetDesiredInputConfig() const override;
    void SetCommandDelegate(FTVUICommandRequested* InDelegate);
    virtual void NativeTick(const FGeometry&,float) override;
    void SetBackAction(UInputAction* InAction) { BackAction = InAction; }
protected:
    FTVUICommandRequested* CommandDelegate = nullptr;
    UInputAction* BackAction = nullptr;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVInteractionPromptWidget : public UCommonUserWidget
{
    GENERATED_BODY()
public:
    void SetSnapshot(const FTVUISnapshot& InSnapshot);
    void SetCommandDelegate(FTVUICommandRequested* InDelegate) { CommandDelegate = InDelegate; }
    void SetInteractAction(UInputAction* InAction);
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void NativeConstruct() override;
    virtual void NativeTick(const FGeometry&,float) override;
    bool bPlateAnchored = false; FVector PlateWorld = FVector::ZeroVector;
    FTVUICommandRequested* CommandDelegate = nullptr;
    UInputAction* InteractAction = nullptr;
    UPROPERTY() class UCanvasPanel* Canvas = nullptr;
    UPROPERTY() class UBorder* FocusHighlight = nullptr;
    UPROPERTY() TArray<class UBorder*> FocusEdges;
    UPROPERTY() class UCommonActionWidget* ActionGlyph = nullptr;
    UPROPERTY() class UTextBlock* PromptText = nullptr;
    UPROPERTY() UTVUICommandButton* PromptButton = nullptr;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVDialogueWidget : public UTVCommonActivatableWidget
{
    GENERATED_BODY()
public:
    void SetSnapshot(const FTVUISnapshot& InSnapshot);
    virtual FReply NativeOnKeyDown(const FGeometry& InGeometry, const FKeyEvent& InKeyEvent) override;
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void NativeConstruct() override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    UPROPERTY() class UVerticalBox* Body = nullptr;
    FTVUISnapshot Snapshot;
    UPROPERTY() class UTextBlock* SpeakerText = nullptr;
    TArray<UTextBlock*> LineTexts;
    void Rebuild();
    void AddChoice(int32 Index, const FString& Id, const FString& Label);
    TArray<UTVUICommandButton*> ChoiceButtons;
    int32 BuiltLineCount = -1;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVInventoryWidget : public UTVCommonActivatableWidget
{
    GENERATED_BODY()
public:
    void SetSnapshot(const FTVUISnapshot& InSnapshot);
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void NativeConstruct() override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    UPROPERTY() class UVerticalBox* Body = nullptr;
    FTVUISnapshot Snapshot;
    void Rebuild();
    TArray<UTVUICommandButton*> ItemButtons;
    UTVUICommandButton* BackButton = nullptr;
    /** Rebuilt only when rows, actions or availability change, so focus survives snapshots. */
    FString BuiltSignature;
    UPROPERTY() class UTextBlock* VitalsLine = nullptr;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVContainerWidget : public UTVCommonActivatableWidget
{
    GENERATED_BODY()
public:
    void SetSnapshot(const FTVUISnapshot& InSnapshot);
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void NativeConstruct() override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    UPROPERTY() class UVerticalBox* Body = nullptr;
    FTVUISnapshot Snapshot;
    void Rebuild();
    void AddItem(int32 Index, const FTVUIItemRow& Item);
    TArray<UTVUICommandButton*> ItemButtons;
    UTVUICommandButton* BackButton = nullptr;
    int32 BuiltInventoryRows = -1;
    int32 BuiltContainerRows = -1;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVMenuWidget : public UTVCommonActivatableWidget
{
    GENERATED_BODY()
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual void NativeConstruct() override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    UPROPERTY() class UButton* ResumeButton = nullptr;
    UFUNCTION() void Resume();
};

UCLASS()
class TORNVEILONLINE_API UTVActionPanelWidget : public UTVCommonActivatableWidget {
    GENERATED_BODY()
public:
    void Configure(const FString& InKind,const FString& InText);
    virtual FReply NativeOnPreviewKeyDown(const FGeometry&,const FKeyEvent&) override;
    virtual FReply NativeOnPreviewMouseButtonDown(const FGeometry&,const FPointerEvent&) override;
    void BeginRebind(const FString& Action) { AwaitingBinding=Action; }
    void UpdateJournal(const FString& Value);
    void UpdateAbilities(const TArray<FTVUIActionRow>& Rows);
protected:
    virtual TSharedRef<SWidget> RebuildWidget() override;
    virtual UWidget* NativeGetDesiredFocusTarget() const override;
    virtual void NativeTick(const FGeometry&,float) override;
    void BuildPanel();
    FString Kind,Text,AwaitingBinding,AbilitySignature;
    TArray<FTVUIActionRow> Abilities;
    UPROPERTY() class UVerticalBox* Body=nullptr;
    UPROPERTY() class UTextBlock* Description=nullptr;
    UPROPERTY() UTVUICommandButton* FirstButton=nullptr;
};

UCLASS(Blueprintable)
class TORNVEILONLINE_API UTVPlayerShellWidget : public UCommonActivatableWidget
{
    GENERATED_BODY()
public:
    UTVPlayerShellWidget(const FObjectInitializer& ObjectInitializer = FObjectInitializer::Get());
    virtual TOptional<FUIInputConfig> GetDesiredInputConfig() const override;
    virtual void NativeConstruct() override;
    virtual TSharedRef<SWidget> RebuildWidget() override;
    void SetSnapshot(const FTVUISnapshot& InSnapshot);
    void OpenInventory();
    void OpenDialogue();
    void OpenContainer();
    void OpenMenu();
    void OpenActionPanel(const FString& Kind);
    void BeginRebind(const FString& Action);
    void CloseTop();
    bool HasModalScreen() const;
    void SetCommandDelegate(FTVUICommandRequested* InDelegate);
    void SetInputActions(UInputAction* InInteract, UInputAction* InBack);
    FTVUICommandRequested& OnCommand() { return CommandRequested; }
    FTVModalChanged& OnModalChanged() { return ModalChanged; }
protected:
    UPROPERTY() class UOverlay* RootOverlay = nullptr;
    UPROPERTY() UTVInteractionPromptWidget* Prompt = nullptr;
    UPROPERTY() UCommonActivatableWidgetStack* ModalStack = nullptr;
    UPROPERTY() class UTextBlock* VitalsText = nullptr;
    UPROPERTY() class UTextBlock* RestrictionText = nullptr;
    UInputAction* InteractAction = nullptr;
    UInputAction* BackAction = nullptr;
    FTVUISnapshot Snapshot;
    int32 LastSnapshotRevision = INDEX_NONE;
    FTVUICommandRequested CommandRequested;
    FTVModalChanged ModalChanged;
    FTVUICommandRequested* CommandSink = nullptr;
    void RefreshActiveWidget();
    void HandleDisplayedWidgetChanged(UCommonActivatableWidget* Widget);
};
