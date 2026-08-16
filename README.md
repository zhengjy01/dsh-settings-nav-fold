# dsh-settings-nav-fold

> **English** | [**中文**](README.zh.md)

Declutter the DeepSeek Harness settings panel: with more plugins installed, the settings sidebar grows one entry per plugin. This plugin folds every plugin/extension entry into a single collapsible **Plugin entries** group row, placed right below the system settings, with a dropdown arrow — one click to expand or collapse.

![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)

## Features

- **One group row, right under the system settings** — `通用设置 / Models / Plugins / Agent presets` stay flat; everything else (plugins, extensions, extra pages) folds under `Plugin entries (N) ▾`.
- **One-click expand/collapse** — click the group row to unfold all plugin entries below it; click again to fold them back.
- **Auto-updating** — the count and the fold positions are recomputed from the live `settings.section` ledger, so entries appear/disappear as plugins register or unregister their settings pages. No configuration.
- **Current section never disappears** — the active plugin page stays visible even while folded.
- **Localized** — follows the UI locale (中文 / English).
- **Zero host code** — pure browser-side plugin; nothing runs on the host process.

## Install

```sh
dsh plugin --profile web add github:zhengjy01/dsh-settings-nav-fold
```

Restart `dsh`, open the Settings panel (gear icon at the sidebar foot), and the nav now shows the core entries plus the `Plugin entries (N) ▾` group row.

## How it works

The settings nav list is rendered by the shipped panel and is not a slot, so the plugin:

1. reads the `settings.section` slot ledger (`ctx.slots.entries`) and sorts it exactly like the panel does;
2. injects the group row into the nav list DOM right after the last core entry (idempotent — no DOM change when already placed);
3. marks plugin buttons with `data-snav-plugin` and the list with `data-snav-folded`, and hides them via a small stylesheet (the active `aria-current` row stays visible);
4. follows the ledger and panel re-renders with a `MutationObserver`, so the group stays correct as plugins come and go.

Everything is owned by the plugin fiber: styles, subscriptions, the observer, and the injected row are removed when the plugin is stopped or uninstalled.

## Uninstall

Remove the plugin from the profile and delete the line(s) it added to `cordis.patch.yml`:

```sh
dsh plugin --profile web remove dsh-settings-nav-fold
```

## License

[MIT](LICENSE)
