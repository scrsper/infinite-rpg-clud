#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "TVSoundscape.generated.h"

class UAudioComponent;
class USoundAttenuation;
class USoundWave;

/**
 * What the world sounds like, presentation only. Ambience follows the same canonical clock and
 * weather that light the sky (UTVPlayableLighting::SkyFor): wind and birds by day, wind and
 * crickets at night, rain when it rains. Footsteps come from bodies actually moving; coins and
 * eating from the player's own vitals changing. Nothing here reads or writes canonical state
 * beyond what the client is already shown. The sounds are synthesized (scripts/audio/
 * synthesize-sounds.mjs) and imported by unreal/scripts/import_local_sounds.py; without them the
 * world is silent and this logs once.
 */
UCLASS()
class TORNVEILONLINE_API UTVSoundscape : public UTickableWorldSubsystem {
    GENERATED_BODY()
public:
    virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
    virtual void Tick(float DeltaTime) override;
    virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UTVSoundscape, STATGROUP_Tickables); }

    /** Canonical time (world seconds) and weather, as the region dynamic reports them. */
    void SetCanonicalAmbience(double WorldTimeSeconds, const FString& Kind, double Intensity);
    /** Ambience mix for a time and weather: day, night and rain weights in 0..1. Pure; tested. */
    static FVector3f AmbienceWeights(double WorldTimeSeconds, const FString& Kind, double Intensity);
    void Footstep(const FVector& At, bool bRunning);
    /** What is actually playing, for automated evidence (loops, mix, cues so far). */
    FString Diagnostics() const;

private:
    bool EnsureSounds();
    UPROPERTY() TObjectPtr<USoundWave> Day;
    UPROPERTY() TObjectPtr<USoundWave> Night;
    UPROPERTY() TObjectPtr<USoundWave> Rain;
    UPROPERTY() TArray<TObjectPtr<USoundWave>> Steps;
    UPROPERTY() TObjectPtr<USoundWave> Coins;
    UPROPERTY() TObjectPtr<USoundWave> Eat;
    UPROPERTY() TObjectPtr<USoundAttenuation> Near;
    UPROPERTY() TArray<TObjectPtr<UAudioComponent>> Loops;
    FVector3f Target = FVector3f::ZeroVector, Current = FVector3f::ZeroVector;
    bool bLoaded = false, bMissing = false, bHasAmbience = false;
    double LastSilver = -1, LastHunger = -1;
    int32 NextStep = 0, CoinCues = 0, EatCues = 0;
};
