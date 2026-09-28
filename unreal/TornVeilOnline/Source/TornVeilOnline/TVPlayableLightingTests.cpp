#include "TVPlayableLighting.h"
#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Engine/DirectionalLight.h"
#include "Engine/PostProcessVolume.h"
#include "Components/LightComponent.h"
#include "TVWorldProjection.h"
#include "Dom/JsonObject.h"
#include "TVRenderedFrameCheck.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTVPlayableDaylight,
    "TornVeil.Presentation.DaylightInfrastructure", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FTVPlayableDaylight::RunTest(const FString&) {
    UWorld* World=UWorld::CreateWorld(EWorldType::Game,false);
    TestFalse(TEXT("empty map fails validation"),UTVPlayableLighting::ValidateDaylight(World).IsEmpty());
    TestEqual(TEXT("empty map repaired"),UTVPlayableLighting::EnsureDaylight(World),FString());
    TestEqual(TEXT("repeat setup is idempotent"),UTVPlayableLighting::EnsureDaylight(World),FString());
    auto* Sun=*TActorIterator<ADirectionalLight>(World);
    Sun->GetLightComponent()->SetIntensity(100);
    TestFalse(TEXT("exact human black-frame sun intensity fails"),UTVPlayableLighting::ValidateDaylight(World).IsEmpty());
    UTVPlayableLighting::EnsureDaylight(World);
    auto* Post=*TActorIterator<APostProcessVolume>(World);
    Post->Settings.AutoExposureMaxBrightness=20;
    TestFalse(TEXT("stale exposure fails"),UTVPlayableLighting::ValidateDaylight(World).IsEmpty());
    UTVPlayableLighting::EnsureDaylight(World);
    Sun->Destroy();
    TestFalse(TEXT("missing light fails"),UTVPlayableLighting::ValidateDaylight(World).IsEmpty());
    TestEqual(TEXT("missing light repaired"),UTVPlayableLighting::EnsureDaylight(World),FString());
    auto* Projection=World->SpawnActor<ATVWorldProjection>();
    // Exercise the actual region update path that previously replaced the sun at 05:43.
    for (double Hour : {5.72425, 12., 22.}) {
        for (const FString Kind : {FString(TEXT("clear")),FString(TEXT("storm"))}) {
            auto Weather=MakeShared<FJsonObject>(); Weather->SetStringField(TEXT("kind"),Kind);
            auto Dynamic=MakeShared<FJsonObject>(); Dynamic->SetNumberField(TEXT("worldTime"),Hour*3600);
            Dynamic->SetObjectField(TEXT("environment"),Weather);
            auto Frame=MakeShared<FJsonObject>(); Frame->SetObjectField(TEXT("dynamic"),Dynamic);
            Projection->Apply(Frame,FVector::ZeroVector);
            // The sky follows the canonical clock and weather, and what it shows is checkable.
            TestEqual(TEXT("sky matches canonical time and weather"),UTVPlayableLighting::ValidateSky(World,Hour*3600,Kind,0),FString());
            TestEqual(TEXT("projection never rewrites canonical clock DTO"),Dynamic->GetNumberField(TEXT("worldTime")),Hour*3600);
        }
    }
    const auto Noon=UTVPlayableLighting::SkyFor(12*3600,TEXT("clear"),0),Storm=UTVPlayableLighting::SkyFor(12*3600,TEXT("storm"),0);
    const auto Dawn=UTVPlayableLighting::SkyFor(5.72425*3600,TEXT("clear"),0),Late=UTVPlayableLighting::SkyFor(22*3600,TEXT("clear"),0);
    TestTrue(TEXT("noon is full daylight"),!Noon.bNight&&FMath::IsNearlyEqual(Noon.SunLux,12000.f));
    TestTrue(TEXT("a storm dims the noon sun"),Storm.SunLux<Noon.SunLux*.5f);
    TestTrue(TEXT("before dawn and at 22:00 it is night"),Dawn.bNight&&Late.bNight);
    // The earlier black frames: a dim night under a fixed EV100 12. Night exposure may now adapt.
    TestTrue(TEXT("night exposure can adapt down"),Late.MinEV100<=0.f&&Late.SunLux>0.f&&Late.SkyIntensity>0.f);
    const auto Dusk=UTVPlayableLighting::SkyFor(20.4*3600,TEXT("clear"),0);
    TestTrue(TEXT("dusk is twilight: past sunset, still lit well above moonlight"),Dusk.bNight&&Dusk.SunLux>50*Late.SunLux&&Dusk.MinEV100>Late.MinEV100);
    TestTrue(TEXT("moonlight is within the exposure floor (EV100 -2 needs about 0.6 lux)"),Late.SunLux>=.6f&&Late.MinEV100>=-2.f);
    TestEqual(TEXT("evening sun is warm and low"),UTVPlayableLighting::SkyFor(19.5*3600,TEXT("clear"),0).Color.B<.9f,true);
    UTVPlayableLighting::ApplyCanonicalSky(World,12*3600,TEXT("clear"),0);
    (*TActorIterator<ADirectionalLight>(World))->GetLightComponent()->SetIntensity(100);
    TestFalse(TEXT("a noon black-out is still refused"),UTVPlayableLighting::ValidateSky(World,12*3600,TEXT("clear"),0).IsEmpty());
    UTVPlayableLighting::EnsureDaylight(World);
    World->SpawnActor<ADirectionalLight>();
    TestFalse(TEXT("duplicates rejected, not silently accumulated"),UTVPlayableLighting::EnsureDaylight(World).IsEmpty());
    World->DestroyWorld(false);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FTVRenderedReadability,
    "TornVeil.Presentation.RenderedReadability", EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FTVRenderedReadability::RunTest(const FString&) {
    TArray<FColor> Pixels; Pixels.Init(FColor::Black,640*360);
    auto Measure=[&](){return FTVRenderedFrameCheck::Measure(MakeArrayView(Pixels),640,360);};
    TestFalse(TEXT("black frame fails"),Measure().bPassed);
    for(int32 Y=0;Y<65;++Y) for(int32 X=0;X<640;++X) Pixels[Y*640+X]=FColor::White;
    TestFalse(TEXT("bright HUD cannot mask missing world"),Measure().bPassed);
    for(int32 Y=90;Y<280;++Y) for(int32 X=300;X<345;++X) Pixels[Y*640+X]=FColor::White;
    TestFalse(TEXT("bright mannequin on black world fails"),Measure().bPassed);
    for(int32 Y=0;Y<360;++Y) for(int32 X=0;X<640;++X) { uint8 V=2+X%18; Pixels[Y*640+X]=FColor(V,V,V); }
    TestFalse(TEXT("grossly underexposed patterned world fails"),Measure().bPassed);
    Pixels.Init(FColor(120,120,120),640*360);
    TestFalse(TEXT("flat blank frame fails"),Measure().bPassed);
    for(int32 Y=0;Y<360;++Y) for(int32 X=0;X<640;++X) { uint8 V=45+X%140; Pixels[Y*640+X]=FColor(V,V,V); }
    TestTrue(TEXT("readable shaded daylight passes"),Measure().bPassed);
    return true;
}
#endif
