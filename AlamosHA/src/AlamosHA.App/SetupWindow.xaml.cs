using System.Windows;
using AlamosHA.Core.Adapters;
using AlamosHA.Core.Models;

namespace AlamosHA.App;

public partial class SetupWindow : Window
{
    public SetupWindow()
    {
        InitializeComponent();
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(SiteNameBox.Text)) missing.Add("Standortname");
        if (string.IsNullOrWhiteSpace(TailnetBox.Text)) missing.Add("Tailnet-Name");
        if (string.IsNullOrWhiteSpace(ApiKeyBox.Password)) missing.Add("Tailscale API-Key");
        if (string.IsNullOrWhiteSpace(ServiceNameBox.Text)) missing.Add("Alamos-Dienstname");
        if (string.IsNullOrWhiteSpace(PeerDeviceIdBox.Text)) missing.Add("Gegenstelle (Geräte-ID/Hostname)");
        if (string.IsNullOrWhiteSpace(PeerHostBox.Text)) missing.Add("Gegenstelle (Tailscale-Host für Konflikt-Check)");

        if (missing.Count > 0)
        {
            ErrorText.Text = "Bitte ausfüllen: " + string.Join(", ", missing);
            ErrorText.Visibility = Visibility.Visible;
            return;
        }

        var config = new AppConfig
        {
            SiteName = SiteNameBox.Text.Trim(),
            Tailnet = TailnetBox.Text.Trim(),
            ApiKey = ApiKeyBox.Password,
            AlamosServiceName = ServiceNameBox.Text.Trim(),
            PeerDeviceId = PeerDeviceIdBox.Text.Trim(),
            PeerTailscaleHost = PeerHostBox.Text.Trim(),
            IsPrimaryByDefault = IsPrimaryCheckBox.IsChecked == true,
        };

        try
        {
            ConfigStore.Save(App.ConfigPath, config);
        }
        catch (Exception ex)
        {
            ErrorText.Text = $"Speichern fehlgeschlagen: {ex.Message}";
            ErrorText.Visibility = Visibility.Visible;
            return;
        }

        DialogResult = true;
        Close();
    }
}
