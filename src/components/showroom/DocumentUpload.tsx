import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileUp, FileCheck, Loader2, Eye } from 'lucide-react';

interface Props {
  label: string;
  currentUrl: string | null;
  bucketPath: string;
  onUploaded: (url: string) => void;
}

const DocumentUpload: React.FC<Props> = ({ label, currentUrl, bucketPath, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
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
    onUploaded(urlData.publicUrl);
    toast.success(`${label} enviado(a) com sucesso`);
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : currentUrl ? (
          <FileCheck className="h-4 w-4 text-green-600" />
        ) : (
          <FileUp className="h-4 w-4" />
        )}
        {currentUrl ? `${label} ✓` : `Anexar ${label}`}
      </Button>
      {currentUrl && (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 px-2"
          onClick={() => window.open(currentUrl, '_blank')}
        >
          <Eye className="h-4 w-4" /> Ver
        </Button>
      )}
    </div>
  );
};

export default DocumentUpload;
