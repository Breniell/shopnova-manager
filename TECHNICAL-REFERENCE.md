# Release v1.3.2 - Documentation Technique

## 📝 Commits inclus

```
ecc4555 - chore: update privacy policy version to 1.3.2
b31220d - chore(release): v1.3.2 - Add prepare-release script and release alias
0759fdb - Sync project with legwan v1.3 final, cleanup duplicate nested folders and ignore local artifacts
39ceace - feat: integrate Legwan v1.3 modules
0d850f9 - Créé comptes test & tests
```

## 🔧 Configuration Build

### electron-builder.yml
- **Target OS** : Windows (x64, ia32)
- **Installer** : NSIS
- **Signing** : Enabled (Signtool.exe)
- **After Pack** : Icon injection via rcedit
- **GitHub Publish** : 
  - Owner: Breniell
  - Repo: shopnova-manager

### Fichiers de Config
- `vite.config.ts` - Multi-mode (web, electron)
- `tsconfig.json` - TypeScript strict mode
- `postcss.config.js` - Tailwind CSS processing
- `tailwind.config.ts` - Styling configuration

## 📊 Test Coverage

**Framework** : Vitest v3.2.4
**Total Tests** : 441
**Status** : 100% passing
**Duration** : 98.59 seconds
**Coverage Files** : 31 test files

### Key Test Categories
- Components (SideDrawer, ReceiptModal, EmptyState, etc.)
- Stores (useAuthStore, useSaleStore, useInventoryStore, etc.)
- Utils (formatters, validators)
- Integrations (Firebase, APIs)

## 🛠️ Outils de Développement

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | v22.17.0 | Runtime |
| npm | v11.6.2 | Package manager |
| Vite | v5.4.21 | Build tool |
| Electron | v26.6.10 | Desktop framework |
| electron-builder | v26.8.1 | Packaging |
| React | v18.3.1 | UI framework |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Styling |
| Radix UI | Latest | Component library |
| Firebase | Latest | Backend |

## 📦 Dépendances Critiques

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "electron": "^26.6.10",
    "firebase": "^9.x"
  },
  "devDependencies": {
    "vitest": "^3.2.4",
    "vite": "^5.4.21",
    "electron-builder": "^26.8.1",
    "typescript": "latest"
  }
}
```

## 🔐 Security & Signing

- **Code Signing** : Enabled (Signtool.exe)
- **Auto-Update** : electron-updater via latest.yml
- **NSIS Installer** : French UI, signed executable
- **Blockmap** : Delta updates for efficient distribution

## 📝 Configuration Auto-Update (latest.yml)

```yaml
version: 1.3.2
files:
  - url: Legwan-Setup-1.3.2.exe
    sha512: [hash]
    size: 73070374
path: Legwan-Setup-1.3.2.exe
sha512: [hash]
releaseDate: '2026-06-01T14:33:23.240Z'
```

## 🚀 Scripts NPM

### Development
```bash
npm run dev              # Start dev server
npm run build:web        # Build web version
npm run electron:dev     # Dev with Electron
```

### Production
```bash
npm test                 # Run tests
npm run build            # Build all
npm run electron:build   # Vite build for Electron
npm run electron:dist    # Package with electron-builder
npm run electron:dist:safe  # Safe wrapper with .env checks
npm run prepare-release  # Test + electron:dist:safe
npm run release          # prepare-release alias
```

### Build Artifacts
```bash
npm run build            # Generates build/ folder
npm run electron:dist    # Generates release/ folder
                        # └─ Legwan Setup 1.3.2.exe
                        # └─ Legwan Setup 1.3.2.exe.blockmap
                        # └─ latest.yml
```

## 📂 Project Structure

```
shopnova-manager/
├── src/
│   ├── components/          # React components
│   ├── pages/               # Page components
│   ├── services/            # API & Firebase
│   ├── stores/              # Zustand stores (state management)
│   ├── hooks/               # Custom React hooks
│   ├── utils/               # Helper functions
│   ├── lib/                 # Library code
│   ├── assets/              # Static assets
│   ├── test/                # Test utilities
│   ├── App.tsx              # Main app component
│   └── main.tsx             # React entry point
├── electron/                # Electron main process
│   ├── main.js              # Electron entry
│   ├── preload.js           # IPC preload
│   └── package.json         # Electron package config
├── scripts/                 # Build & automation scripts
│   ├── build-electron.js    # Safe build wrapper
│   ├── create-github-release.ps1  # Release automation
│   └── merge-demo-videos.js
├── tests/                   # Playwright E2E tests
├── release/                 # Release artifacts
│   ├── Legwan Setup 1.3.2.exe
│   ├── Legwan Setup 1.3.2.exe.blockmap
│   └── latest.yml
├── build/                   # Vite build output
├── public/                  # Static files
├── package.json             # NPM manifest
├── vite.config.ts           # Vite config
├── vitest.config.ts         # Vitest config
├── electron-builder.yml     # Electron builder config
├── tsconfig.json            # TypeScript config
└── README.md                # Documentation
```

## 🐛 Debugging Checklist

If issues arise:

1. **Version Mismatch**
   ```bash
   grep -r "1.3.2" src/ package.json release/
   ```

2. **Test Failures**
   ```bash
   npm test -- --reporter=verbose
   ```

3. **Build Issues**
   ```bash
   npm run build:web          # Debug web build
   npm run electron:build     # Debug Electron build
   npm run electron:dist:safe # Debug packaging
   ```

4. **Auto-Update Config**
   - Check: `release/latest.yml` contains correct version & hash
   - Verify: GitHub release has blockmap attached
   - Test: Download via GitHub release page

5. **Git Status**
   ```bash
   git log -1 --oneline       # Verify latest commit
   git tag -l                  # Verify tags
   git status                  # Check uncommitted changes
   ```

## 📅 Release Timeline

- **v1.0.0** - April 16, 2026 (Initial release)
- **v1.1** - May, 2026 (Credit management)
- **v1.2.1** - May, 2026 (Price negotiation)
- **v1.2.2** - May 17, 2026 (Cash sessions)
- **v1.3** - May 19, 2026 (Inventory & reconciliation)
- **v1.3.2** - May 26, 2026 (Current - combined features)

---

**Last Updated** : June 1, 2026
**Version** : 1.3.2
**Status** : Ready for production
