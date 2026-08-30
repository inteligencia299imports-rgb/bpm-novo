import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FileUp, FileCheck, Loader2, Eye, Trash2, Download, Save } from 'lucide-react';

interface Props {
  label: string;
  currentUrl: string | null;
  bucketPath: string;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
  className?: string;
  /** Somente leitura: permite apenas visualizar/baixar o arquivo (sem anexar nem remover). */
  readOnly?: boolean;
}

const DocumentUpload: React.FC<Props> = ({ label, currentUrl, bucketPath, onUploaded, onRemoved, className, readOnly }) => {
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${bucketPath}.${ext}`;

    const { error } = await supabase.storage
      .from('moto-fotos')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (error) {
      toast.error(`Erro ao enviar ${label}`);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('moto-fotos').getPublicUrl(path);
    const newUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    onUploaded(newUrl);
    toast.success(`${label} enviado(a) com sucesso`);
    setUploading(false);
    setDialogOpen(true);
  };

  const handleRemove = async () => {
    // Remove from storage (best effort)
    const extensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
    for (const ext of extensions) {
      await supabase.storage.from('moto-fotos').remove([`${bucketPath}.${ext}`]);
    }
    onRemoved?.();
    setDialogOpen(false);
    toast.success(`${label} removido(a)`);
  };

  const isImage = currentUrl && /\.(jpg|jpeg|png|webp|gif)/i.test(currentUrl.split('?')[0]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-1.5', currentUrl && 'border-green-500 text-green-600 hover:bg-green-50', className)}
        disabled={uploading || (readOnly && !currentUrl)}
        onClick={() => {
          if (currentUrl) {
            setDialogOpen(true);
          } else if (!readOnly) {
            inputRef.current?.click();
          }
        }}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : currentUrl ? (
          <FileCheck className="h-4 w-4" />
        ) : (
          <FileUp className="h-4 w-4" />
        )}
        {currentUrl ? `${label} ✓` : label}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" /> {label}
            </DialogTitle>
          </DialogHeader>

          {currentUrl && (
            <div className="space-y-4">
              {/* Preview */}
              <div className="rounded-lg border overflow-hidden bg-muted/30 flex items-center justify-center min-h-[200px]">
                {isImage ? (
                  <img
                    src={currentUrl}
                    alt={label}
                    className="max-w-full max-h-[300px] object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <FileCheck className="h-12 w-12 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Documento PDF anexado</span>
                    {!readOnly && (
                      <Button
                        size="sm"
                        onClick={() => window.open(currentUrl, '_blank')}
                        className="gap-1.5 mt-2"
                      >
                        <Eye className="h-4 w-4" /> Abrir PDF
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className={cn('grid gap-2', readOnly ? 'grid-cols-2' : 'grid-cols-3')}>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 w-full"
                  onClick={async () => {
                    try {
                      const response = await fetch(currentUrl);
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const ext = currentUrl.split('?')[0].split('.').pop() || 'jpg';
                      a.download = `${label}.${ext}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {
                      window.open(currentUrl, '_blank');
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> Baixar
                </Button>
                {readOnly ? (
                  <Button
                    size="sm"
                    className="gap-1.5 w-full"
                    onClick={() => window.open(currentUrl, '_blank')}
                  >
                    <Eye className="h-4 w-4" /> Abrir
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 w-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      onClick={handleRemove}
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 w-full"
                      onClick={() => setDialogOpen(false)}
                    >
                      <Save className="h-4 w-4" /> Salvar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DocumentUpload;
