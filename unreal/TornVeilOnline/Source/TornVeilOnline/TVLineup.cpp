#include "CoreMinimal.h"
#include "Camera/CameraActor.h"
#include "Camera/CameraComponent.h"
#include "Components/PointLightComponent.h"
#include "Engine/PointLight.h"
#include "Components/CapsuleComponent.h"
#include "Containers/Ticker.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "HAL/IConsoleManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "TVBridgeSubsystem.h"
#include "TVCharacter.h"
#include "TVEmbodiment.h"
#include "UnrealClient.h"

/**
 * TV.Lineup <file.png> [count] — a character lineup from the running game, for judging looks.
 *
 * Clones the player and the nearest projected people (their already-resolved appearance, nothing
 * else) into a row on open ground in front of the player, facing a fixed camera, hides the real
 * bodies for a moment, takes one screenshot without UI, writes <file>.json naming each person's
 * resolved parts, then puts everything back. Presentation only: canonical state is untouched.
 */
namespace TVLineup {
struct FState { TWeakObjectPtr<UWorld> World; TArray<TWeakObjectPtr<AActor>> Spawned, Hidden; TWeakObjectPtr<AActor> OldView; double StartedAt = 0; FString File; bool bShot = false; };
static FState S;

static UWorld* GameWorld() { for (const FWorldContext& C : GEngine->GetWorldContexts()) if ((C.WorldType == EWorldType::Game || C.WorldType == EWorldType::PIE) && C.World()) return C.World(); return nullptr; }

static void Restore() {
    UWorld* W = S.World.Get();
    for (auto& A : S.Spawned) if (A.IsValid()) A->Destroy();
    for (auto& A : S.Hidden) if (A.IsValid()) A->SetActorHiddenInGame(false);
    if (W) if (APlayerController* PC = W->GetFirstPlayerController()) PC->SetViewTarget(S.OldView.IsValid() ? S.OldView.Get() : PC->GetPawn());
    S.Spawned.Empty(); S.Hidden.Empty();
}

static bool Tick(float) {
    const double Age = FPlatformTime::Seconds() - S.StartedAt;
    // Give streaming textures, hair and the idle pose time to settle before the picture.
    if (!S.bShot && Age > 4.0) {
        S.bShot = true; FScreenshotRequest::RequestScreenshot(S.File, false, false);
        FString Lines; // what each clone is actually playing when the picture is taken
        for (const auto& A : S.Spawned) if (const ATVCharacter* C = Cast<ATVCharacter>(A.Get())) Lines += C->PresentationDiagnostics() + LINE_TERMINATOR;
        FFileHelper::SaveStringToFile(Lines, *(FPaths::GetPath(S.File) / TEXT("lineup-diagnostics.jsonl")));
        return true;
    }
    if (S.bShot && Age > 6.0) { Restore(); UE_LOG(LogTemp, Display, TEXT("TV_LINEUP done %s"), *S.File); return false; }
    return true;
}

static float GroundZ(UWorld* W, const FVector& At, float Fallback) {
    FHitResult Hit; FCollisionQueryParams Q(TEXT("TVLineupGround"), false);
    for (const auto& A : S.Spawned) if (A.IsValid()) Q.AddIgnoredActor(A.Get());
    for (TActorIterator<ATVCharacter> It(W); It; ++It) Q.AddIgnoredActor(*It);
    return W->LineTraceSingleByChannel(Hit, At + FVector(0, 0, 400), At - FVector(0, 0, 600), ECC_Visibility, Q) ? Hit.ImpactPoint.Z : Fallback;
}

/** Activity families shown one per clone of the player in activities mode. */
static const TCHAR* Activities[] = { TEXT(""), TEXT("socialize"), TEXT("trade"), TEXT("work"), TEXT("work/chop"), TEXT("carry"), TEXT("drink"), TEXT("eat"), TEXT("rest"), TEXT("travel"), TEXT("injured") };

void Start(const FString& File, int32 Count, bool bActivities) {
    UWorld* W = GameWorld(); if (!W) return;
    auto* B = W->GetSubsystem<UTVBridgeSubsystem>(); APlayerController* PC = W->GetFirstPlayerController();
    ATVCharacter* Player = PC ? Cast<ATVCharacter>(PC->GetPawn()) : nullptr;
    if (!B || !Player) { UE_LOG(LogTemp, Error, TEXT("TV_LINEUP needs a live player")); return; }
    Restore(); S = FState(); S.World = W; S.File = File; S.StartedAt = FPlatformTime::Seconds(); S.OldView = PC->GetViewTarget();
    TArray<ATVCharacter*> People = { Player };
    TArray<ATVCharacter*> Others;
    for (const auto& Pair : B->Bodies) if (ATVCharacter* C = Pair.Value.Get(); IsValid(C) && C != Player && !C->bDead) Others.Add(C);
    Others.Sort([Player](const ATVCharacter& A, const ATVCharacter& C) { return FVector::DistSquared(A.GetActorLocation(), Player->GetActorLocation()) < FVector::DistSquared(C.GetActorLocation(), Player->GetActorLocation()); });
    if (bActivities) { People.Empty(); for (int32 I = 0; I < UE_ARRAY_COUNT(Activities); ++I) People.Add(Player); }
    else for (ATVCharacter* C : Others) { if (People.Num() >= Count) break; People.Add(C); }
    const FVector Forward = FRotator(0, PC->GetControlRotation().Yaw, 0).Vector(), Right = FRotationMatrix(FRotator(0, PC->GetControlRotation().Yaw, 0)).GetUnitAxis(EAxis::Y);
    const FVector Centre = Player->GetActorLocation() + Forward * 700.f;
    const float Spacing = 105.f, Half = Player->GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
    TArray<TSharedPtr<FJsonValue>> Rows;
    for (int32 I = 0; I < People.Num(); ++I) {
        FVector At = Centre + Right * ((I - (People.Num() - 1) * .5f) * Spacing);
        At.Z = GroundZ(W, At, Player->GetActorLocation().Z - Half) + Half;
        FActorSpawnParameters P; P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
        ATVCharacter* Clone = W->SpawnActor<ATVCharacter>(At, (-Forward).Rotation(), P);
        if (!Clone) continue;
        Clone->CopyPresentationFrom(*People[I]); S.Spawned.Add(Clone);
        // A lineup judges looks in a neutral stand; activities mode shows one activity clip each.
        FString Family, Detail; FString(bActivities ? Activities[I] : TEXT("")).Split(TEXT("/"), &Family, &Detail);
        if (Family.IsEmpty()) Family = bActivities ? FString(Activities[I]) : FString();
        Clone->Embodiment.Activity.Family = Family; Clone->Embodiment.Activity.Detail = Detail; Clone->Embodiment.Activity.Posture = TEXT("stand");
        auto J = MakeShared<FJsonObject>(); J->SetNumberField(TEXT("index"), I); J->SetStringField(TEXT("who"), bActivities ? FString::Printf(TEXT("activity:%s"), Activities[I]) : I == 0 ? FString(TEXT("player")) : People[I]->DisplayName);
        TArray<TSharedPtr<FJsonValue>> Parts; for (const FTVFoundrySlot& Slot : People[I]->Embodiment.Appearance.Slots) Parts.Add(MakeShared<FJsonValueString>(Slot.Slot + TEXT("=") + Slot.Name));
        J->SetArrayField(TEXT("parts"), Parts); Rows.Add(MakeShared<FJsonValueObject>(J));
    }
    for (const auto& Pair : B->Bodies) if (ATVCharacter* C = Pair.Value.Get(); IsValid(C) && !C->IsHidden()) { C->SetActorHiddenInGame(true); S.Hidden.Add(C); }
    FActorSpawnParameters CP; ACameraActor* Camera = W->SpawnActor<ACameraActor>(Player->GetActorLocation() + FVector(0, 0, 60) - Forward * 20.f, FRotator::ZeroRotator, CP);
    if (Camera) {
        const FVector Look = FVector(Centre.X, Centre.Y, Player->GetActorLocation().Z + 10.f);
        Camera->SetActorRotation((Look - Camera->GetActorLocation()).Rotation()); Camera->GetCameraComponent()->SetFieldOfView(People.Num() > 6 ? 70.f : 55.f);
        S.Spawned.Add(Camera); PC->SetViewTarget(Camera);
        // A soft key light from beside the camera, so the lineup is judged the same at any hour.
        if (APointLight* Key = W->SpawnActor<APointLight>(Camera->GetActorLocation() + FVector(0, 0, 150) + Right * 250.f, FRotator::ZeroRotator, CP)) {
            Key->PointLightComponent->SetMobility(EComponentMobility::Movable); Key->PointLightComponent->SetIntensityUnits(ELightUnits::Candelas);
            Key->PointLightComponent->SetIntensity(1500.f); Key->PointLightComponent->SetAttenuationRadius(2500.f); Key->PointLightComponent->SetSourceRadius(80.f);
            S.Spawned.Add(Key);
        }
    }
    FString Json; auto Writer = TJsonWriterFactory<>::Create(&Json); FJsonSerializer::Serialize(Rows, Writer); Writer->Close();
    FFileHelper::SaveStringToFile(Json, *(FPaths::ChangeExtension(File, TEXT("json"))), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
    FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateStatic(&Tick));
    UE_LOG(LogTemp, Display, TEXT("TV_LINEUP %d people -> %s"), S.Spawned.Num() - 1, *File);
}

static FAutoConsoleCommand Command(TEXT("TV.Lineup"), TEXT("TV.Lineup <file.png> [count] [activities] — presentation-only character lineup screenshot of the player and nearby people"),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args) { if (Args.Num()) Start(Args[0], Args.Num() > 1 ? FMath::Clamp(FCString::Atoi(*Args[1]), 1, 12) : 8, Args.Num() > 2 && Args[2] == TEXT("activities")); }));
}
