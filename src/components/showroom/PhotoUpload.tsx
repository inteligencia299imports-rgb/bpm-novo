import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, ExternalLink, Trash2 } from 'lucide-react';
import { TIPOS_FOTO, TIPOS_FOTO_LABELS } from '@/types/crm';
import type { MotoFoto } from '@/types/crm';
import { toast } from 'sonner';

interface Props {
  avaliacaoId: string;
}

const PhotoUpload: React.FC<Props> = ({ avaliacaoId }) => {
  const [fotos, setFotos] = useState<MotoFoto[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('moto_fotos').select('*').eq('avaliacao_id', avaliacaoId);
      if (data) setFotos(data);
    };
    load();
  }, [avaliacaoId]);

  const compressImage = (file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Falha ao comprimir')),
          'image/webp',
          quality
        );
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async (tipo: string, file: File) => {
    setUploading(tipo);

    let uploadFile: Blob | File;
    try {
      uploadFile = await compressImage(file);
    } catch {
      uploadFile = file;
    }

    const path = `${avaliacaoId}/${tipo}.webp`;

    const { error: upErr } = await supabase.storage.from('moto-fotos').upload(path, uploadFile, { upsert: true, contentType: 'image/webp' });
    if (upErr) { toast.error('Erro no upload'); setUploading(null); return; }

    const { data: urlData } = supabase.storage.from('moto-fotos').getPublicUrl(path);
    const url = urlData.publicUrl;

    // Remove existing if any
    const existing = fotos.find(f => f.tipo === tipo);
    if (existing) {
      await supabase.from('moto_fotos').delete().eq('id', existing.id);
    }

    const { data, error } = await supabase.from('moto_fotos').insert({
      avaliacao_id: avaliacaoId, tipo, url,
    }).select().single();

    if (error) { toast.error('Erro ao salvar foto'); }
    else {
      setFotos(prev => [...prev.filter(f => f.tipo !== tipo), data]);
      toast.success(`${TIPOS_FOTO_LABELS[tipo]} enviada`);
    }
    setUploading(null);
  };

  const handleDelete = async (foto: MotoFoto) => {
    const path = `${avaliacaoId}/${foto.tipo}.webp`;
    await supabase.storage.from('moto-fotos').remove([path]);
    await supabase.from('moto_fotos').delete().eq('id', foto.id);
    setFotos(prev => prev.filter(f => f.id !== foto.id));
    toast.success(`${TIPOS_FOTO_LABELS[foto.tipo]} removida`);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TIPOS_FOTO.map(tipo => {
          const foto = fotos.find(f => f.tipo === tipo);
          return (
            <div key={tipo} className="relative group">
              <label className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors overflow-hidden bg-muted/50">
                {uploading === tipo ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : foto ? (
                  <img src={foto.url} alt={TIPOS_FOTO_LABELS[tipo]} className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Camera className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-[10px] text-muted-foreground text-center px-1">{TIPOS_FOTO_LABELS[tipo]}</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(tipo, f);
                }} />
              </label>
              {foto && !uploading && (
                <>
                  <span className="absolute bottom-0 left-0 right-0 bg-foreground/60 text-background text-[9px] text-center py-0.5 truncate">
                    {TIPOS_FOTO_LABELS[tipo]}
                  </span>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(foto.url, '_blank'); }}
                      className="p-1 rounded-full bg-foreground/70 text-background hover:bg-foreground/90 transition-colors"
                      title="Visualizar"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(foto); }}
                      className="p-1 rounded-full bg-destructive/80 text-destructive-foreground hover:bg-destructive transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhotoUpload;
