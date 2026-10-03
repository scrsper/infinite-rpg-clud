#include "CoreMinimal.h"
#include "Async/Async.h"
#include "Containers/Ticker.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "HAL/FileManager.h"
#include "HAL/IConsoleManager.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Modules/ModuleManager.h"
#include "UnrealClient.h"

/**
 * TV.RecordVideo start <dir> [fps] [width] / TV.RecordVideo stop — evidence video from the running game.
 *
 * Uses the engine's own screenshot capture (read inside the viewport draw, world and UI as the
 * player sees them): at each wall-clock slot a capture is requested and the viewport's
 * screenshot-captured delegate receives the pixels, which are scaled and written as numbered
 * JPEGs on a worker thread. A slow frame fills its missed slots with the same picture, so playback
 * keeps wall time. Two readbacks tried first failed under offscreen rendering (the asynchronous
 * frame grabber gave corrupt frames; ReadPixels outside the draw gave black). While the delegate
 * is bound the engine does not save screenshots itself, so other requests (the journey probe's
 * step frames) are written here to the file they asked for. Readback costs frame time: recorded
 * runs are visual evidence, never performance evidence. Presentation tooling only.
 */
namespace TVVideoCapture {
static const TCHAR* Marker = TEXT("tv-record-slot");
struct FState {
    FString Dir; double Interval = 1. / 15, NextAt = 0, Started = 0; int32 Written = 0, OutWidth = 1280;
    FTSTicker::FDelegateHandle Ticker; FDelegateHandle Captured; FIntPoint Size = FIntPoint::ZeroValue; bool bOn = false; TAtomic<int32> Pending{0};
};
static FState S;

static TArray<FColor> Scale(const TArray<FColor>& In, FIntPoint Size, int32 OutWidth, FIntPoint& OutSize) {
    if (Size.X <= OutWidth) { OutSize = Size; return In; }
    const int32 W = OutWidth, H = (Size.Y * OutWidth / Size.X) & ~1; TArray<FColor> Out; Out.SetNumUninitialized(W * H);
    for (int32 Y = 0; Y < H; ++Y) for (int32 X = 0; X < W; ++X) { // box filter
        const int32 X0 = X * Size.X / W, X1 = FMath::Max(X0 + 1, (X + 1) * Size.X / W), Y0 = Y * Size.Y / H, Y1 = FMath::Max(Y0 + 1, (Y + 1) * Size.Y / H);
        uint32 R = 0, G = 0, B = 0, N = 0;
        for (int32 SY = Y0; SY < Y1; ++SY) for (int32 SX = X0; SX < X1; ++SX) { const FColor& C = In[SY * Size.X + SX]; R += C.R; G += C.G; B += C.B; ++N; }
        Out[Y * W + X] = FColor(R / N, G / N, B / N, 255);
    }
    OutSize = FIntPoint(W, H); return Out;
}

static void Encode(TArray<FColor> Pixels, FIntPoint Size, EImageFormat Format, FString File) {
    for (FColor& C : Pixels) C.A = 255;
    IImageWrapperModule& Module = FModuleManager::LoadModuleChecked<IImageWrapperModule>(TEXT("ImageWrapper"));
    TSharedPtr<IImageWrapper> Image = Module.CreateImageWrapper(Format);
    if (Image && Image->SetRaw(Pixels.GetData(), Pixels.Num() * sizeof(FColor), Size.X, Size.Y, ERGBFormat::BGRA, 8))
        FFileHelper::SaveArrayToFile(Image->GetCompressed(Format == EImageFormat::JPEG ? 88 : 0), *File);
}

static void OnCaptured(int32 Width, int32 Height, const TArray<FColor>& Colors) {
    if (!S.bOn || Colors.Num() < Width * Height) return;
    const FString Requested = FScreenshotRequest::GetFilename();
    const double Now = FPlatformTime::Seconds();
    int32 Slots = 0; while (S.NextAt <= Now) { ++Slots; S.NextAt += S.Interval; }
    const bool bForeign = !Requested.Contains(Marker);
    if (!Slots && !bForeign) return;
    const int32 First = S.Written; S.Written += Slots; S.Size = FIntPoint(Width, Height);
    ++S.Pending;
    AsyncTask(ENamedThreads::AnyBackgroundThreadNormalTask, [Colors, Size = S.Size, First, Slots, Dir = S.Dir, OutWidth = S.OutWidth, bForeign, Requested]() {
        if (bForeign) Encode(Colors, Size, EImageFormat::PNG, Requested); // someone else's screenshot, saved as asked
        FIntPoint Small; const TArray<FColor> Frame = Scale(Colors, Size, OutWidth, Small);
        for (int32 I = 0; I < Slots; ++I) Encode(Frame, Small, EImageFormat::JPEG, FPaths::Combine(Dir, FString::Printf(TEXT("frame_%05d.jpg"), First + I)));
        --S.Pending;
    });
}

static bool Tick(float) {
    if (!S.bOn) return false;
    if (FPlatformTime::Seconds() >= S.NextAt && !FScreenshotRequest::IsScreenshotRequested())
        // With the UI: the prompt, the name plate and the conversation are what the evidence is of.
        FScreenshotRequest::RequestScreenshot(FPaths::Combine(S.Dir, FString(Marker) + TEXT(".png")), true, false);
    return true;
}

static void Stop() {
    if (!S.bOn) return;
    S.bOn = false;
    FTSTicker::GetCoreTicker().RemoveTicker(S.Ticker);
    if (GEngine && GEngine->GameViewport) GEngine->GameViewport->OnScreenshotCaptured().Remove(S.Captured);
    for (int32 Wait = 0; S.Pending > 0 && Wait < 500; ++Wait) FPlatformProcess::Sleep(.01f); // let the last files land
    const double Seconds = FPlatformTime::Seconds() - S.Started;
    FFileHelper::SaveStringToFile(FString::Printf(TEXT("fps=%.3f\nframes=%d\nseconds=%.2f\nsource=%dx%d\noutWidth=%d\nmethod=screenshot-delegate\n"), 1. / S.Interval, S.Written, Seconds, S.Size.X, S.Size.Y, S.OutWidth), *FPaths::Combine(S.Dir, TEXT("frames.txt")));
    UE_LOG(LogTemp, Display, TEXT("TV_RECORD stopped frames=%d seconds=%.1f dir=%s"), S.Written, Seconds, *S.Dir);
}

void Start(const FString& Dir, double Fps, int32 Width) {
    Stop();
    if (!GEngine || !GEngine->GameViewport) { UE_LOG(LogTemp, Error, TEXT("TV_RECORD no game viewport")); return; }
    S.Dir = Dir; IFileManager::Get().MakeDirectory(*Dir, true);
    S.Interval = 1. / FMath::Clamp(Fps, 5., 30.); S.OutWidth = FMath::Clamp(Width, 320, 1920); S.Started = S.NextAt = FPlatformTime::Seconds(); S.Written = 0;
    S.Captured = GEngine->GameViewport->OnScreenshotCaptured().AddStatic(&OnCaptured);
    S.bOn = true;
    S.Ticker = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateStatic(&Tick));
    UE_LOG(LogTemp, Display, TEXT("TV_RECORD started at %.0f fps, width %d, into %s"), 1. / S.Interval, S.OutWidth, *Dir);
}
void StopRecording() { Stop(); }

static FAutoConsoleCommand Command(TEXT("TV.RecordVideo"), TEXT("TV.RecordVideo start <dir> [fps] [width] | TV.RecordVideo stop — evidence video frames from the game viewport"),
    FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args) {
        if (Args.Num() >= 2 && Args[0] == TEXT("start")) Start(Args[1], Args.Num() > 2 ? FCString::Atod(*Args[2]) : 15., Args.Num() > 3 ? FCString::Atoi(*Args[3]) : 1280);
        else Stop();
    }));
}
