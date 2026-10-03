#pragma once
#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "TVPlayableLighting.generated.h"

/** Neutral v0.1 daylight, not a second simulation clock or weather authority. */
UCLASS()
class TORNVEILONLINE_API UTVPlayableLighting : public UBlueprintFunctionLibrary {
    GENERATED_BODY()
public:
    /** Shared by map setup and ordinary PIE/game startup. Idempotent; refuses duplicates. */
    UFUNCTION(BlueprintCallable, Category="Torn Veil|Presentation")
    static FString EnsureDaylight(UWorld* World);
    /** Empty means valid. Does not repair the world or change the viewport mode. */
    UFUNCTION(BlueprintCallable, Category="Torn Veil|Presentation")
    static FString ValidateDaylight(UWorld* World, bool RequireLitViewport = false);
    /** Sun, moon, sky, exposure and fog for the canonical world time and weather the server sent.
     *  Presentation of the world's own clock, never a second clock: it reads, it never advances. */
    static FString ApplyCanonicalSky(UWorld* World, double WorldTimeSeconds, const FString& WeatherKind, double WeatherIntensity);
    /** What the sky should be at this canonical time and weather (pure; used to apply and to validate). */
    struct FSky { float SunLux; FRotator Direction; FLinearColor Color; float SkyIntensity; float MinEV100; float FogDensity; bool bNight; };
    static FSky SkyFor(double WorldTimeSeconds, const FString& WeatherKind, double WeatherIntensity);
    /** Empty when the lit world matches SkyFor(time, weather): a noon black-out still fails, a dark night does not. */
    static FString ValidateSky(UWorld* World, double WorldTimeSeconds, const FString& WeatherKind, double WeatherIntensity);
    static FString ValidateLightingStructure(UWorld* World, bool RequireLitViewport, bool RequireNoonBaseline);
    /** Loads the actual completed PNG through Unreal; no Python imaging dependencies. */
    UFUNCTION(BlueprintCallable, Category="Torn Veil|Presentation")
    static FString RenderedFrameDiagnostics(const FString& Path);
};
