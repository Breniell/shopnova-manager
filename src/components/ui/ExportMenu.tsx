import React from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/i18n';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getExportLabels } from '@/lib/exportLabels';
import { runExport, type ReportTable } from '@/lib/reportBuilders';

export interface ExportChoice {
  /** Nom du rapport dans le menu, ex. « Détail article par article ». */
  label: string;
  /** Construit le rapport à l'instant du clic, avec les données du moment. */
  build: () => ReportTable;
}

interface ExportMenuProps {
  reports: ExportChoice[];
  className?: string;
}

/**
 * Bouton « Exporter » : un ou plusieurs rapports, chacun en CSV ou en PDF.
 * Un seul rapport : les deux formats directement. Plusieurs : un groupe par rapport.
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({ reports, className }) => {
  const { locale } = useTranslation();
  const shopName = useSettingsStore(s => s.shop.nom);
  const L = getExportLabels(locale);

  const run = (format: 'csv' | 'pdf', choice: ExportChoice) => {
    const outcome = runExport(format, choice.build(), shopName, L);
    if (outcome === 'empty') toast.error(L.nothingToExport);
    else if (outcome === 'blocked') toast.error(L.popupBlocked);
    else toast.success(format === 'csv' ? L.csvDone : L.pdfOpened);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={className ?? 'nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm'}>
          <Download className="w-4 h-4" /> {L.menuLabel}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {reports.map((choice, i) => (
          <React.Fragment key={choice.label}>
            {i > 0 && <DropdownMenuSeparator />}
            {reports.length > 1 && <DropdownMenuLabel className="text-xs text-muted-foreground">{choice.label}</DropdownMenuLabel>}
            <DropdownMenuItem onSelect={() => run('csv', choice)}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> {L.csv}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => run('pdf', choice)}>
              <FileText className="w-4 h-4 mr-2" /> {L.pdf}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
