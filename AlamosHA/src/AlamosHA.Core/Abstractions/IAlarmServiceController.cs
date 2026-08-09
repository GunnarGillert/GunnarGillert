namespace AlamosHA.Core.Abstractions;

/// <summary>
/// Steuert den lokalen Alamos-Windows-Dienst. Wird Master = Dienst läuft, Standby = Dienst ist gestoppt.
/// </summary>
public interface IAlarmServiceController
{
    Task<bool> IsRunningAsync(CancellationToken ct);

    Task StartAsync(CancellationToken ct);

    Task StopAsync(CancellationToken ct);
}
