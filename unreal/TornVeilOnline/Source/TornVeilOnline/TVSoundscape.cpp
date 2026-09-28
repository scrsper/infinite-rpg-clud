#include "TVSoundscape.h"

#include "Components/AudioComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundWave.h"
#include "TVBridgeSubsystem.h"
#include "TVPlayableLighting.h"

namespace {
USoundWave* LoadWave(const TCHAR* Name) {
    return LoadObject<USoundWave>(nullptr, *FString::Printf(TEXT("/Game/TornVeil/Audio/%s.%s"), Name, Name), nullptr, LOAD_NoWarn | LOAD_Quiet);
}
/** "Hunger 20%   Thirst 20%   16 silver" → the number before " silver" / after "Hunger". */
double VitalsNumber(const FString& Text, const TCHAR* Label, bool bBefore) {
    const int32 At = Text.Find(Label, ESearchCase::IgnoreCase);
    if (At == INDEX_NONE) return -1;
    if (bBefore) { int32 B = At; while (B > 0 && (FChar::IsDigit(Text[B - 1]) || Text[B - 1] == '.')) --B; return B < At ? FCString::Atod(*Text.Mid(B, At - B)) : -1; }
    FString Rest = Text.Mid(At + FCString::Strlen(Label)).TrimStart(); int32 E = 0;
    while (E < Rest.Len() && (FChar::IsDigit(Rest[E]) || Rest[E] == '.')) ++E;
    return E ? FCString::Atod(*Rest.Left(E)) : -1;
}
}

bool UTVSoundscape::ShouldCreateSubsystem(UObject* Outer) const {
    const UWorld* World = Cast<UWorld>(Outer);
    return World && (World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE);
}

FVector3f UTVSoundscape::AmbienceWeights(double WorldTimeSeconds, const FString& Kind, double Intensity) {
    const UTVPlayableLighting::FSky Sky = UTVPlayableLighting::SkyFor(WorldTimeSeconds, Kind, 0);
    // Birds sing while there is light: full by day, fading through twilight with the light itself.
    const float DayW = !Sky.bNight ? 1.f : FMath::Sqrt(FMath::Clamp((Sky.SunLux - 1.2f) / (1000.f - 1.2f), 0.f, 1.f));
    const bool bWet = Kind == TEXT("rain") || Kind == TEXT("storm");
    const float RainW = bWet ? float(FMath::Clamp(Intensity <= 0 ? 1. : Intensity, 0., 1.)) : 0.f;
    const float Open = 1.f - .6f * RainW; // rain covers the wind and the animals
    return FVector3f(DayW * Open, (1.f - DayW) * Open, RainW);
}

void UTVSoundscape::SetCanonicalAmbience(double WorldTimeSeconds, const FString& Kind, double Intensity) {
    Target = AmbienceWeights(WorldTimeSeconds, Kind, Intensity); bHasAmbience = true;
}

bool UTVSoundscape::EnsureSounds() {
    if (bLoaded) return !bMissing;
    bLoaded = true;
    Day = LoadWave(TEXT("SW_TV_AmbDay")); Night = LoadWave(TEXT("SW_TV_AmbNight")); Rain = LoadWave(TEXT("SW_TV_AmbRain"));
    for (int32 I = 1; I <= 4; ++I) if (USoundWave* W = LoadWave(*FString::Printf(TEXT("SW_TV_Step_%d"), I))) Steps.Add(W);
    Coins = LoadWave(TEXT("SW_TV_Coins")); Eat = LoadWave(TEXT("SW_TV_Eat"));
    bMissing = !Day || !Night || !Rain || Steps.IsEmpty() || !Coins || !Eat;
    if (bMissing) { UE_LOG(LogTemp, Warning, TEXT("TV_SOUND sounds missing; run scripts/audio/synthesize-sounds.mjs and unreal/scripts/import_local_sounds.py")); return false; }
    Near = NewObject<USoundAttenuation>(this);
    Near->Attenuation.bAttenuate = true; Near->Attenuation.bSpatialize = true;
    Near->Attenuation.AttenuationShape = EAttenuationShape::Sphere;
    Near->Attenuation.AttenuationShapeExtents = FVector(150.f, 0.f, 0.f); Near->Attenuation.FalloffDistance = 2200.f;
    return true;
}

void UTVSoundscape::Tick(float DeltaTime) {
    UWorld* World = GetWorld();
    if (!World || !World->IsGameWorld() || !EnsureSounds()) return;
    if (bHasAmbience && Loops.IsEmpty()) {
        for (USoundWave* Wave : {Day.Get(), Night.Get(), Rain.Get()}) {
            UAudioComponent* Loop = UGameplayStatics::CreateSound2D(World, Wave, 1.f, 1.f, 0.f, nullptr, true, false);
            if (!Loop) continue;
            Loop->SetVolumeMultiplier(0.f); Loop->Play(); Loops.Add(Loop);
        }
    }
    // Ease toward the canonical mix so a region update never pops the ambience.
    for (int32 I = 0; I < 3; ++I) Current[I] = FMath::FInterpConstantTo(Current[I], Target[I], DeltaTime, .35f);
    static constexpr float Gain[3] = {.55f, .45f, .6f};
    for (int32 I = 0; I < Loops.Num(); ++I) if (Loops[I]) Loops[I]->SetVolumeMultiplier(FMath::Max(.001f, Current[I] * Gain[I]));
    // What the player's own body just did, as the vitals line already shows it.
    if (const UTVBridgeSubsystem* Bridge = World->GetSubsystem<UTVBridgeSubsystem>(); Bridge && Bridge->IsLive()) {
        const double Silver = VitalsNumber(Bridge->PlayerVitals, TEXT(" silver"), true), Hunger = VitalsNumber(Bridge->PlayerVitals, TEXT("Hunger"), false);
        if (Silver >= 0 && LastSilver >= 0 && !FMath::IsNearlyEqual(Silver, LastSilver)) { UGameplayStatics::PlaySound2D(World, Coins, .7f); ++CoinCues; }
        if (Hunger >= 0 && LastHunger >= 0 && Hunger <= LastHunger - 5) { UGameplayStatics::PlaySound2D(World, Eat, .8f); ++EatCues; }
        if (Silver >= 0) LastSilver = Silver; if (Hunger >= 0) LastHunger = Hunger;
    }
}

FString UTVSoundscape::Diagnostics() const {
    int32 Playing = 0; for (const UAudioComponent* Loop : Loops) if (Loop && Loop->IsPlaying()) ++Playing;
    return FString::Printf(TEXT("{\"soundsLoaded\":%s,\"loopsPlaying\":%d,\"mix\":{\"day\":%.2f,\"night\":%.2f,\"rain\":%.2f},\"footsteps\":%d,\"coinCues\":%d,\"eatCues\":%d}"),
        bLoaded && !bMissing ? TEXT("true") : TEXT("false"), Playing, Current.X, Current.Y, Current.Z, NextStep, CoinCues, EatCues);
}

void UTVSoundscape::Footstep(const FVector& At, bool bRunning) {
    UWorld* World = GetWorld();
    if (!World || !EnsureSounds()) return;
    USoundWave* Wave = Steps[NextStep++ % Steps.Num()];
    UGameplayStatics::PlaySoundAtLocation(World, Wave, At, bRunning ? .8f : .55f, FMath::FRandRange(.92f, 1.08f), 0.f, Near);
}
