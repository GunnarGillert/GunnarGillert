using AlamosHA.Core.Abstractions;

namespace AlamosHA.Core.Tests.Fakes;

public sealed class FakeAlarmServiceController : IAlarmServiceController
{
    public bool IsRunning { get; private set; }
    public int StartCallCount { get; private set; }
    public int StopCallCount { get; private set; }

    public Task<bool> IsRunningAsync(CancellationToken ct) => Task.FromResult(IsRunning);

    public Task StartAsync(CancellationToken ct)
    {
        StartCallCount++;
        IsRunning = true;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct)
    {
        StopCallCount++;
        IsRunning = false;
        return Task.CompletedTask;
    }
}
