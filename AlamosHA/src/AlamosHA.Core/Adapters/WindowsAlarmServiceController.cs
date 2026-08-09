using System.Runtime.Versioning;
using System.ServiceProcess;
using AlamosHA.Core.Abstractions;

namespace AlamosHA.Core.Adapters;

/// <summary>
/// Steuert den Alamos-Windows-Dienst über den Service Control Manager. Der Rechner, auf dem das
/// Wächter-Programm läuft, muss dafür mit einem Konto ausgeführt werden, das Dienste starten und
/// stoppen darf (z. B. lokaler Administrator).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsAlarmServiceController : IAlarmServiceController
{
    private readonly string _serviceName;
    private readonly TimeSpan _timeout;

    public WindowsAlarmServiceController(string serviceName, TimeSpan? timeout = null)
    {
        _serviceName = serviceName;
        _timeout = timeout ?? TimeSpan.FromSeconds(30);
    }

    public Task<bool> IsRunningAsync(CancellationToken ct)
    {
        using var sc = new ServiceController(_serviceName);
        return Task.FromResult(sc.Status == ServiceControllerStatus.Running);
    }

    public Task StartAsync(CancellationToken ct)
    {
        using var sc = new ServiceController(_serviceName);
        sc.Refresh();
        if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
        {
            return Task.CompletedTask;
        }

        sc.Start();
        sc.WaitForStatus(ServiceControllerStatus.Running, _timeout);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken ct)
    {
        using var sc = new ServiceController(_serviceName);
        sc.Refresh();
        if (sc.Status is ServiceControllerStatus.Stopped or ServiceControllerStatus.StopPending)
        {
            return Task.CompletedTask;
        }

        sc.Stop();
        sc.WaitForStatus(ServiceControllerStatus.Stopped, _timeout);
        return Task.CompletedTask;
    }
}
