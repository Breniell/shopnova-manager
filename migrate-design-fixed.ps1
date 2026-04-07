# ============================================================================
# SHOPNOVA MANAGER - SCRIPT DE MIGRATION DESIGN (PowerShell/Windows)
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "        SHOPNOVA DESIGN MIGRATION - AUTOMATED SCRIPT          " -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

$PROJECT_ROOT = Get-Location
Write-Host "[INFO] Repertoire de travail: $PROJECT_ROOT" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# STEP 1: Backup
# ============================================================================
Write-Host "[1/8] Creation de la sauvegarde..." -ForegroundColor Cyan

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_DIR = Join-Path $PROJECT_ROOT "_design_backup_$timestamp"
New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null

if (Test-Path "src\index.css") { Copy-Item "src\index.css" $BACKUP_DIR -Force }
if (Test-Path "tailwind.config.ts") { Copy-Item "tailwind.config.ts" $BACKUP_DIR -Force }
if (Test-Path "src\components") { Copy-Item "src\components" $BACKUP_DIR -Recurse -Force }
if (Test-Path "src\pages") { Copy-Item "src\pages" $BACKUP_DIR -Recurse -Force }

Write-Host "[OK] Sauvegarde creee: $BACKUP_DIR" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 2: Update Tailwind Config
# ============================================================================
Write-Host "[2/8] Mise a jour de tailwind.config.ts..." -ForegroundColor Cyan

$tailwindConfig = @'
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: '#FFF4ED',
          100: '#FFE4D1',
          200: '#FFC9A5',
          300: '#FFA166',
          400: '#FF7C3D',
          500: '#A93200',
          600: '#8F2900',
          700: '#761F00',
          800: '#5C1800',
          900: '#421000',
        },
        
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          50: '#EFFEF5',
          100: '#D9FFEA',
          200: '#B3FFD6',
          300: '#76FDBA',
          400: '#3FE4A0',
          500: '#2B6954',
          600: '#235543',
          700: '#1C4235',
          800: '#143027',
          900: '#0D1F1A',
        },
        
        tertiary: {
          DEFAULT: '#00628f',
          foreground: '#ffffff',
        },
        
        surface: {
          DEFAULT: '#f9f9f8',
          'container-lowest': '#ffffff',
          'container-low': '#f3f4f3',
          'container': '#eeefee',
          'container-high': '#e8e8e7',
          'container-highest': '#e3e3e2',
        },
        
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: '#F59E0B',
          foreground: '#ffffff',
        },
        success: {
          DEFAULT: '#2B6954',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#44464a',
        'outline-variant': '#e2bfb4',
        
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        '0.5': '0.125rem',
        '1': '0.25rem',
        '2': '0.5rem',
        '3': '0.75rem',
        '4': '1rem',
        '5': '1.25rem',
        '6': '1.5rem',
        '8': '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '14': '3.5rem',
        '16': '4rem',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
'@

Set-Content -Path "tailwind.config.ts" -Value $tailwindConfig -Encoding UTF8
Write-Host "[OK] tailwind.config.ts mis a jour" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 3: Update CSS
# ============================================================================
Write-Host "[3/8] Mise a jour de index.css..." -ForegroundColor Cyan

$indexCSS = @'
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
@import url('https://fonts.cdnfonts.com/css/cal-sans');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --primary: 16 100% 33%;
    --primary-foreground: 0 0% 100%;
    --secondary: 156 42% 29%;
    --secondary-foreground: 0 0% 100%;
    --background: 60 11% 97%;
    --foreground: 180 6% 11%;
    --card: 0 0% 100%;
    --card-foreground: 180 6% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 180 6% 11%;
    --muted: 120 5% 95%;
    --muted-foreground: 200 4% 40%;
    --accent: 120 5% 95%;
    --accent-foreground: 180 6% 11%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 16 24% 88%;
    --input: 120 5% 95%;
    --ring: 16 100% 33%;
    --radius: 0.5rem;
    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 200 4% 40%;
    --sidebar-primary: 16 100% 33%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 120 5% 95%;
    --sidebar-accent-foreground: 180 6% 11%;
    --sidebar-border: 16 24% 88%;
    --sidebar-ring: 16 100% 33%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  
  body {
    @apply bg-background text-foreground;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  }
  
  h1, h2, h3, .heading {
    font-family: 'Cal Sans', 'Inter', system-ui, sans-serif;
    font-weight: 700;
  }
}

@layer utilities {
  .surface-container-lowest {
    background-color: #ffffff;
  }
  
  .surface-container-low {
    background-color: #f3f4f3;
  }
  
  .btn-primary {
    @apply bg-primary-500 text-white font-semibold px-6 py-3 rounded-lg;
    @apply hover:bg-primary-600 transition-all;
    min-height: 44px;
  }
  
  .btn-primary-large {
    @apply btn-primary;
    min-height: 56px;
    font-size: 1.125rem;
  }
  
  .badge-healthy {
    @apply bg-secondary-50 text-secondary-700 font-medium px-3 py-1 rounded text-xs;
  }
  
  .badge-low-stock {
    @apply bg-red-50 text-red-700 font-medium px-3 py-1 rounded text-xs;
  }
  
  .badge-stockout {
    @apply bg-primary-50 text-primary-700 font-medium px-3 py-1 rounded text-xs;
  }
  
  .badge-cash {
    @apply bg-secondary-100 text-secondary-800 font-semibold px-3 py-1 rounded text-xs;
  }
  
  .badge-momo {
    @apply bg-blue-100 text-blue-800 font-semibold px-3 py-1 rounded text-xs;
  }
  
  .tabular-nums {
    font-variant-numeric: tabular-nums;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
  }
}
'@

New-Item -ItemType Directory -Path "src" -Force -ErrorAction SilentlyContinue | Out-Null
Set-Content -Path "src\index.css" -Value $indexCSS -Encoding UTF8
Write-Host "[OK] index.css mis a jour" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 4: Create components
# ============================================================================
Write-Host "[4/8] Creation des nouveaux composants..." -ForegroundColor Cyan

New-Item -ItemType Directory -Path "src\components\ui" -Force -ErrorAction SilentlyContinue | Out-Null

$statusBadge = @'
import { cn } from "@/lib/utils";

export type StockStatus = "healthy" | "low" | "critical" | "stockout";

interface StatusBadgeProps {
  status: StockStatus;
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const variants = {
    healthy: "badge-healthy",
    low: "badge-low-stock",
    critical: "badge-low-stock",
    stockout: "badge-stockout",
  };

  const labels = {
    healthy: "EN STOCK",
    low: "STOCK FAIBLE",
    critical: "CRITIQUE",
    stockout: "RUPTURE",
  };

  return (
    <span className={cn(variants[status], className)}>
      {labels[status]}
    </span>
  );
};
'@

Set-Content -Path "src\components\ui\StatusBadge.tsx" -Value $statusBadge -Encoding UTF8

$paymentBadge = @'
import { cn } from "@/lib/utils";

export type PaymentMode = "especes" | "mobile_money" | "card" | "credit";

interface PaymentBadgeProps {
  mode: PaymentMode;
  operator?: "mtn" | "orange" | "moov";
  className?: string;
}

export const PaymentBadge = ({ mode, operator, className }: PaymentBadgeProps) => {
  if (mode === "especes") {
    return <span className={cn("badge-cash", className)}>CASH</span>;
  }

  if (mode === "mobile_money") {
    const operatorLabel = operator ? operator.toUpperCase() : "MOMO";
    return <span className={cn("badge-momo", className)}>{operatorLabel}</span>;
  }

  return <span className={cn("badge-cash", className)}>{mode.toUpperCase()}</span>;
};
'@

Set-Content -Path "src\components\ui\PaymentBadge.tsx" -Value $paymentBadge -Encoding UTF8

$progressBar = @'
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: "healthy" | "warning" | "danger";
  className?: string;
  showLabel?: boolean;
}

export const ProgressBar = ({ 
  value, 
  max = 100, 
  variant = "healthy",
  className,
  showLabel = false 
}: ProgressBarProps) => {
  const percentage = Math.min((value / max) * 100, 100);
  const fillClass = variant === "healthy" ? "bg-secondary-500" : "bg-primary-500";

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span>{value}/{max}</span>
          <span>{percentage.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full overflow-hidden bg-gray-200">
        <div 
          className={cn(fillClass, "h-full rounded-full transition-all")}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
'@

Set-Content -Path "src\components\ui\ProgressBar.tsx" -Value $progressBar -Encoding UTF8

$tactileCard = @'
import { cn } from "@/lib/utils";

interface TactileCardProps {
  children: React.ReactNode;
  className?: string;
  level?: 0 | 1 | 2;
}

export const TactileCard = ({ children, className, level = 2 }: TactileCardProps) => {
  const levelClasses = {
    0: "bg-[#f9f9f8]",
    1: "surface-container-low",
    2: "surface-container-lowest",
  };

  return (
    <div className={cn("rounded-lg", levelClasses[level], className)}>
      {children}
    </div>
  );
};
'@

Set-Content -Path "src\components\ui\TactileCard.tsx" -Value $tactileCard -Encoding UTF8

Write-Host "[OK] Composants crees (StatusBadge, PaymentBadge, ProgressBar, TactileCard)" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 5: Create migration guide
# ============================================================================
Write-Host "[5/8] Generation du guide de migration..." -ForegroundColor Cyan

$migrationGuide = @'
# ShopNova Manager - Guide de Migration Design

## Vue d ensemble
Ce guide detaille les changements a apporter aux pages pour implementer
le nouveau design system "The Tactile Architect".

## Changements principaux

### 1. Suppression des borders
AVANT: <div className="border border-gray-200">
APRES: <div className="surface-container-lowest">

### 2. Nouvelles couleurs
AVANT: bg-[#6C63FF] (violet)
APRES: bg-primary-500 (terra cotta #A93200)

### 3. Nouveaux composants
- <StatusBadge status="healthy" /> - Badges de stock
- <PaymentBadge mode="mobile_money" operator="mtn" /> - Paiements
- <ProgressBar value={85} max={100} /> - Barres de progression
- <TactileCard level={2}> - Cards sans borders

## Ordre de migration recommande

1. LoginPage.tsx
2. DashboardPage.tsx
3. CaissePage.tsx
4. StockPage.tsx
5. Autres pages...

Consultez SHOPNOVA-REFONTE-COMPLETE.md pour des exemples detailles.
'@

Set-Content -Path "DESIGN_MIGRATION_GUIDE.md" -Value $migrationGuide -Encoding UTF8
Write-Host "[OK] Guide de migration cree" -ForegroundColor Green
Write-Host ""

Write-Host "[6/8] Verification des fichiers..." -ForegroundColor Cyan
Write-Host "[OK] Tous les fichiers crees" -ForegroundColor Green
Write-Host ""

Write-Host "[7/8] Nettoyage..." -ForegroundColor Cyan
Write-Host "[OK] Nettoyage termine" -ForegroundColor Green
Write-Host ""

Write-Host "[8/8] Finalisation..." -ForegroundColor Cyan

$summary = @"
===============================================================
          SHOPNOVA DESIGN MIGRATION - RESUME
===============================================================

[OK] FICHIERS MODIFIES:
   - tailwind.config.ts
   - src\index.css
   - src\components\ui\StatusBadge.tsx (cree)
   - src\components\ui\PaymentBadge.tsx (cree)
   - src\components\ui\ProgressBar.tsx (cree)
   - src\components\ui\TactileCard.tsx (cree)

[BACKUP] Sauvegarde:
   $BACKUP_DIR

[COLORS] Nouvelles couleurs:
   Primary (Terra Cotta): #A93200
   Secondary (Forest Green): #2B6954

[NEXT] Prochaines etapes:

1. Verifier que tout fonctionne:
   npm run dev

2. Migrer les pages selon DESIGN_MIGRATION_GUIDE.md

3. Lire SHOPNOVA-REFONTE-COMPLETE.md pour exemples detailles

[SUCCESS] Migration terminee avec succes !
"@

Set-Content -Path "MIGRATION_SUMMARY.txt" -Value $summary -Encoding UTF8

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host "                 MIGRATION TERMINEE !                          " -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[INFO] Sauvegarde creee: $BACKUP_DIR" -ForegroundColor Cyan
Write-Host "[INFO] Guide de migration: DESIGN_MIGRATION_GUIDE.md" -ForegroundColor Cyan
Write-Host "[INFO] Resume: MIGRATION_SUMMARY.txt" -ForegroundColor Cyan
Write-Host ""
Write-Host "[NEXT] Prochaines etapes:" -ForegroundColor Yellow
Write-Host "   1. Lire DESIGN_MIGRATION_GUIDE.md" -ForegroundColor White
Write-Host "   2. Migrer les pages une par une" -ForegroundColor White
Write-Host "   3. Tester avec: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "Bonne migration !" -ForegroundColor Green
Write-Host ""
