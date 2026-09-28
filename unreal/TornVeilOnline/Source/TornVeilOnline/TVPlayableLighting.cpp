#include "TVPlayableLighting.h"
#include "EngineUtils.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/GameViewportClient.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "HAL/IConsoleManager.h"
#include "TVRenderedFrameCheck.h"
#include "ImageUtils.h"
#include "ImageCore.h"

namespace {
constexpr float SunLux = 12000.f;
constexpr float DaylightEV100 = 12.f;
// Interiors adapt down to EV100 7 so a lantern-lit room reads; daylight exteriors still meter at 12.
constexpr float InteriorEV100 = 7.f;
// A lower afternoon sun models facades and terrain; overhead light flattens them.
const FRotator SunRotation(-36,-35,0);
template<class T> TArray<T*> Find(UWorld* World) {
    TArray<T*> Result;
    for (TActorIterator<T> It(World); It; ++It) Result.Add(*It);
    return Result;
}

template<class T> T* FindOrSpawn(UWorld* World) {
    auto Actors = Find<T>(World);
    return Actors.IsEmpty() ? World->SpawnActor<T>() : Actors[0];
}
bool CVarIs(const TCHAR* Name, int32 Value) {
    const auto* CVar = IConsoleManager::Get().FindConsoleVariable(Name);
    return CVar && CVar->GetInt() == Value;
}
}

FString UTVPlayableLighting::RenderedFrameDiagnostics(const FString& Path) {
    FImage Image;
    if (!FImageUtils::LoadImage(*Path,Image)) {
        FTVRenderedFrameCheck Result; Result.Error=TEXT("Cannot load completed screenshot"); return Result.Json();
    }
    Image.ChangeFormat(ERawImageFormat::BGRA8,EGammaSpace::sRGB);
    return FTVRenderedFrameCheck::Measure(Image.AsBGRA8(),Image.SizeX,Image.SizeY).Json();
}

FString UTVPlayableLighting::EnsureDaylight(UWorld* World) {
    if (!World) return TEXT("No presentation world");
    if (Find<ADirectionalLight>(World).Num()>1 || Find<ASkyLight>(World).Num()>1 ||
        Find<ASkyAtmosphere>(World).Num()>1 || Find<APostProcessVolume>(World).Num()>1 ||
        Find<AExponentialHeightFog>(World).Num()>1)
        return TEXT("Duplicate global lighting actors; repair the generic presentation level");
    auto* Sun = FindOrSpawn<ADirectionalLight>(World);
    auto* Sky = FindOrSpawn<ASkyLight>(World);
    auto* Atmosphere = FindOrSpawn<ASkyAtmosphere>(World);
    auto* Fog = FindOrSpawn<AExponentialHeightFog>(World);
    auto* Post = FindOrSpawn<APostProcessVolume>(World);
    if (!Sun || !Sky || !Atmosphere || !Fog || !Post) return TEXT("Could not create daylight infrastructure");
    auto* Light = CastChecked<UDirectionalLightComponent>(Sun->GetLightComponent());
    Light->SetMobility(EComponentMobility::Movable);
    Light->bAffectsWorld = true;
    Light->SetVisibility(true);
    Light->SetLightColor(FLinearColor::White);
    Light->SetIntensity(SunLux);
    Light->SetAtmosphereSunLight(true);
    Sun->SetActorHiddenInGame(false);
    Sun->SetActorRotation(SunRotation);
    auto* SkyLight = Sky->GetLightComponent();
    SkyLight->SetMobility(EComponentMobility::Movable);
    SkyLight->bAffectsWorld = true;
    SkyLight->SetVisibility(true);
    SkyLight->SetLightColor(FLinearColor::White);
    SkyLight->SourceType = SLS_CapturedScene;
    SkyLight->SetIntensity(1.f);
    SkyLight->SetRealTimeCapture(true);
    SkyLight->MarkRenderStateDirty();
    Sky->SetActorHiddenInGame(false);
    Atmosphere->SetActorHiddenInGame(false);
    Atmosphere->GetRootComponent()->SetVisibility(true);
    Fog->SetActorLocation(FVector(0,0,-1000));
    Fog->GetComponent()->SetFogDensity(.014f);
    // Aerial depth: distant woods soften into the sky instead of ending at a hard horizon.
    Fog->GetComponent()->SetFogHeightFalloff(.05f);
    Fog->GetComponent()->SetStartDistance(4000.f);
    Post->bEnabled = true;
    Post->bUnbound = true;
    Post->BlendWeight = 1.f;
    Post->Priority = 0.f;
    // Stale per-level color grading must not define the neutral baseline.
    Post->Settings = FPostProcessSettings();
    auto& Settings = Post->Settings;
    Settings.bOverride_AutoExposureMethod = true;
    Settings.AutoExposureMethod = AEM_Histogram;
    Settings.bOverride_AutoExposureMinBrightness = true;
    Settings.bOverride_AutoExposureMaxBrightness = true;
    Settings.AutoExposureMinBrightness = InteriorEV100;
    Settings.AutoExposureMaxBrightness = DaylightEV100;
    Settings.bOverride_AutoExposureBias = true;
    Settings.AutoExposureBias = 1.f;
    return ValidateDaylight(World);
}

UTVPlayableLighting::FSky UTVPlayableLighting::SkyFor(double WorldTimeSeconds, const FString& Kind, double Intensity) {
    // The simulation's day: people rise about six and are abed by nine; the sun keeps those hours.
    const double Hour=FMath::Fmod(FMath::Fmod(WorldTimeSeconds,86400.)+86400.,86400.)/3600.;
    const double DayT=(Hour-6.)/14.; // 0 at sunrise, 1 at sunset
    const bool bDay=DayT>0&&DayT<1;
    const double Elevation=bDay?FMath::Sin(PI*DayT)*58.:0.;
    const double Weather=Kind==TEXT("storm")?.2:Kind==TEXT("rain")?.35:Kind==TEXT("cloudy")?.55:Kind==TEXT("fog")?.6:1.;
    const double Cover=FMath::Lerp(1.,Weather,FMath::Clamp(Intensity<=0?1.:Intensity,0.,1.));
    FSky S;
    if(Elevation>1.5){
        const double Rise=FMath::SmoothStep(0.,18.,Elevation); // low sun is weaker and warmer
        S.SunLux=float(SunLux*FMath::Lerp(.08,1.,Rise)*Cover);
        S.Direction=FRotator(-float(Elevation),float(-100.+DayT*200.),0.f);
        S.Color=FLinearColor::LerpUsingHSV(FLinearColor(1.f,.62f,.38f),FLinearColor::White,float(Rise));
        S.SkyIntensity=1.f;S.MinEV100=InteriorEV100;S.bNight=false;
    } else {
        // Twilight, then moonlight. For an hour and a half after sunset (and before sunrise) the
        // sky still lights the land from the sun's side, fading fast; a hard switch to moonlight at
        // 20:00 turned a playable dusk black. Moonlight is brighter than a real moon (1.2 lux, not
        // 0.3) so exposure, floored at EV100 −2, can reach it: night is dark, not black.
        constexpr double MoonLux=1.2,TwilightLux=1000.,TwilightHours=1.5;
        const double FromSun=FMath::Min(FMath::Abs(Hour-20.),FMath::Abs(Hour-6.)),Dusk=FMath::Abs(Hour-20.)<FMath::Abs(Hour-6.)?1.:0.;
        const double T=1.-FMath::SmoothStep(0.,TwilightHours,FromSun),Glow=T*T*T;
        S.SunLux=float(FMath::Lerp(MoonLux,TwilightLux,Glow)*Cover);
        S.Direction=T>0?FRotator(-4.f,float(Dusk>0?100.:-100.),0.f):FRotator(-40.f,160.f,0.f);
        S.Color=FLinearColor::LerpUsingHSV(FLinearColor(.62f,.72f,1.f),FLinearColor(1.f,.52f,.42f),float(Glow));
        S.SkyIntensity=float(FMath::Lerp(.8,1.,T));S.MinEV100=float(FMath::Lerp(-2.,double(InteriorEV100),Glow));S.bNight=true;
    }
    S.FogDensity=Kind==TEXT("fog")?.05f:(Kind==TEXT("rain")||Kind==TEXT("storm"))?.03f:.014f;
    return S;
}

FString UTVPlayableLighting::ApplyCanonicalSky(UWorld* World, double WorldTimeSeconds, const FString& Kind, double Intensity) {
    if (!World) return TEXT("No presentation world");
    const auto Suns=Find<ADirectionalLight>(World);const auto Skies=Find<ASkyLight>(World);const auto Posts=Find<APostProcessVolume>(World);
    if (Suns.Num()!=1||Skies.Num()!=1||Posts.Num()!=1) return TEXT("Expected exactly one sun, skylight and post-process volume");
    const FSky S=SkyFor(WorldTimeSeconds,Kind,Intensity);
    auto* Light=CastChecked<UDirectionalLightComponent>(Suns[0]->GetLightComponent());
    Light->SetIntensity(S.SunLux);Light->SetLightColor(S.Color);Suns[0]->SetActorRotation(S.Direction);
    Skies[0]->GetLightComponent()->SetIntensity(S.SkyIntensity);
    Posts[0]->Settings.AutoExposureMinBrightness=S.MinEV100;
    for (TActorIterator<AExponentialHeightFog> It(World); It; ++It) It->GetComponent()->SetFogDensity(S.FogDensity);
    return FString();
}

FString UTVPlayableLighting::ValidateSky(UWorld* World, double WorldTimeSeconds, const FString& Kind, double Intensity) {
    const FString Structure=ValidateLightingStructure(World,false,false);if(!Structure.IsEmpty())return Structure;
    const FSky S=SkyFor(WorldTimeSeconds,Kind,Intensity);
    const auto* Sun=CastChecked<UDirectionalLightComponent>(Find<ADirectionalLight>(World)[0]->GetLightComponent());
    if(!FMath::IsNearlyEqual(Sun->Intensity,S.SunLux,.01f)||!Find<ADirectionalLight>(World)[0]->GetActorRotation().Equals(S.Direction,.1f))
        return TEXT("Sun does not match the canonical time and weather");
    if(!FMath::IsNearlyEqual(Find<APostProcessVolume>(World)[0]->Settings.AutoExposureMinBrightness,S.MinEV100))
        return TEXT("Exposure range does not match the canonical time");
    return FString();
}

FString UTVPlayableLighting::ValidateDaylight(UWorld* World, bool RequireLitViewport) { return ValidateLightingStructure(World,RequireLitViewport,true); }
/** The lighting rig is whole and sane. With RequireNoonBaseline it must also be the noon default
 *  EnsureDaylight installs; without it, time-of-day values are checked by ValidateSky instead. */
FString UTVPlayableLighting::ValidateLightingStructure(UWorld* World, bool RequireLitViewport, bool RequireNoonBaseline) {
    if (!World) return TEXT("No presentation world");
    const auto Suns=Find<ADirectionalLight>(World);
    const auto Skies=Find<ASkyLight>(World);
    const auto Atmospheres=Find<ASkyAtmosphere>(World);
    const auto Posts=Find<APostProcessVolume>(World);
    if (Suns.Num()!=1 || Skies.Num()!=1 || Atmospheres.Num()!=1 || Posts.Num()!=1)
        return TEXT("Expected exactly one directional light, skylight, sky atmosphere and post-process volume");
    const auto* Sun=CastChecked<UDirectionalLightComponent>(Suns[0]->GetLightComponent());
    if (Sun->Mobility!=EComponentMobility::Movable || !Sun->bAffectsWorld || !Sun->IsVisible() ||
        Suns[0]->IsHidden() || !Sun->bAtmosphereSunLight || Sun->Intensity<=0.f ||
        (RequireNoonBaseline && (!FMath::IsNearlyEqual(Sun->Intensity,SunLux) || !Suns[0]->GetActorRotation().Equals(SunRotation,.1f))))
        return TEXT("Directional light is not the 12000-lux movable daylight baseline");
    const auto* Sky=Skies[0]->GetLightComponent();
    if (Sky->Mobility!=EComponentMobility::Movable || !Sky->bAffectsWorld || !Sky->IsVisible() ||
        Skies[0]->IsHidden() || !Sky->bRealTimeCapture || Sky->SourceType!=SLS_CapturedScene ||
        Sky->Intensity<=0.f || (RequireNoonBaseline && !FMath::IsNearlyEqual(Sky->Intensity,1.f)))
        return TEXT("Skylight must be visible, movable and capture the live atmosphere at intensity 1");
    if (Atmospheres[0]->IsHidden() || !Atmospheres[0]->GetRootComponent()->IsVisible())
        return TEXT("Sky atmosphere is hidden");
    const auto* Post=Posts[0];
    const auto& S=Post->Settings;
    if (!Post->bEnabled || !Post->bUnbound || !FMath::IsNearlyEqual(Post->BlendWeight,1.f) ||
        !S.bOverride_AutoExposureMethod || S.AutoExposureMethod!=AEM_Histogram ||
        !S.bOverride_AutoExposureMinBrightness || !S.bOverride_AutoExposureMaxBrightness ||
        (RequireNoonBaseline ? !FMath::IsNearlyEqual(S.AutoExposureMinBrightness,InteriorEV100) : (S.AutoExposureMinBrightness<-2.f||S.AutoExposureMinBrightness>InteriorEV100)) ||
        !FMath::IsNearlyEqual(S.AutoExposureMaxBrightness,DaylightEV100) ||
        !S.bOverride_AutoExposureBias || !FMath::IsNearlyEqual(S.AutoExposureBias,1.f))
        return TEXT("Post-process exposure must be unbound, enabled, EV100 7-12 with compensation +1");
    if (!CVarIs(TEXT("r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange"),1) ||
        !CVarIs(TEXT("r.DynamicGlobalIlluminationMethod"),1) ||
        !CVarIs(TEXT("r.ReflectionMethod"),1) || !CVarIs(TEXT("r.Lumen.DiffuseIndirect.Allow"),1))
        return TEXT("Expected extended EV100 exposure and enabled Lumen GI/reflections");
    if (RequireLitViewport && (!World->GetGameViewport() || World->GetGameViewport()->ViewModeIndex!=VMI_Lit))
        return TEXT("PIE acceptance requires a real Lit game viewport (Unlit is not a fix)");
    return FString();
}
