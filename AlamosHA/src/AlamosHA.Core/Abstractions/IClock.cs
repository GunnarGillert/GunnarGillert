namespace AlamosHA.Core.Abstractions;

/// <summary>Abstraktion über die Systemzeit, damit die FailoverEngine ohne echte Wartezeiten testbar ist.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
