import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { SEXOS, UFS } from '@/types/crm';
import { formatPersonName, formatPersonNameInput } from '@/lib/utils';
import DocumentUpload from '@/components/showroom/DocumentUpload';

interface Props {
  clienteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const formatPhone = (digits: string): string => {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
const formatCpfCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
const formatCep = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? d.replace(/(\d{5})(\d)/, '$1-$2') : d;
};

const ClienteEditDialog: React.FC<Props> = ({ clienteId, open, onOpenChange, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [cnhDocId, setCnhDocId] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [sexo, setSexo] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    if (!open || !clienteId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: cliente }, { data: endereco }, { data: docs }] = await Promise.all([
        supabase.from('clientes_fornecedores').select('*').eq('id', clienteId).maybeSingle(),
        supabase.from('clientes_fornecedores_enderecos').select('*').eq('cliente_fornecedor_id', clienteId).eq('tipo', 'fiscal').maybeSingle(),
        supabase.from('clientes_fornecedores_documentos').select('*').eq('cliente_fornecedor_id', clienteId).eq('tipo_documento', 'cnh').maybeSingle(),
      ]);
      setNome(cliente ? formatPersonName(cliente.nome_razao_social || '') : '');
      setTelefone(cliente?.telefone ? formatPhone(cliente.telefone.replace(/\D/g, '')) : '');
      setSexo(cliente?.sexo || '');
      setCpfCnpj(cliente?.cpf_cnpj ? formatCpfCnpj(cliente.cpf_cnpj) : '');
      setEmail(cliente?.email || '');
      setEnderecoId(endereco?.id || null);
      setCep(endereco?.cep ? formatCep(endereco.cep) : '');
      setLogradouro(endereco?.logradouro || '');
      setNumero(endereco?.numero || '');
      setComplemento(endereco?.complemento || '');
      setBairro(endereco?.bairro || '');
      setCidade(endereco?.cidade || '');
      setUf(endereco?.uf || '');
      setCnhDocId(docs?.id || null);
      setCnhUrl(docs?.arquivo_url || null);
      setLoading(false);
    };
    load();
  }, [open, clienteId]);

  const buscarCep = async (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setLogradouro(data.logradouro || '');
        setBairro(data.bairro || '');
        setCidade(data.localidade || '');
        setUf(data.uf || '');
      }
    } catch {
      // best effort - CEP lookup failing shouldn't block manual entry
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleSave = async () => {
    if (!clienteId) return;
    const telDigits = telefone.replace(/\D/g, '');
    if (!nome.trim() || telDigits.length !== 11) {
      toast.error('Preencha nome e telefone corretamente');
      return;
    }
    setSaving(true);

    const { error: clienteError } = await supabase.from('clientes_fornecedores').update({
      nome_razao_social: formatPersonName(nome),
      telefone: telDigits,
      sexo: sexo || null,
      cpf_cnpj: cpfCnpj.replace(/\D/g, '') || null,
      email: email.trim() || null,
      tipo_pessoa: cpfCnpj.replace(/\D/g, '').length > 11 ? 'juridica' : 'fisica',
    }).eq('id', clienteId);

    if (clienteError) {
      toast.error('Erro ao salvar dados do cliente');
      setSaving(false);
      return;
    }

    const enderecoPayload = {
      cliente_fornecedor_id: clienteId,
      tipo: 'fiscal',
      cep: cep.replace(/\D/g, '') || null,
      logradouro: logradouro.trim() || null,
      numero: numero.trim() || null,
      complemento: complemento.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidade.trim() || null,
      uf: uf || null,
    };
    const enderecoTemAlgo = cep || logradouro || numero || complemento || bairro || cidade || uf;
    if (enderecoId) {
      await supabase.from('clientes_fornecedores_enderecos').update(enderecoPayload).eq('id', enderecoId);
    } else if (enderecoTemAlgo) {
      await supabase.from('clientes_fornecedores_enderecos').insert(enderecoPayload);
    }

    setSaving(false);
    toast.success('Dados do cliente atualizados!');
    onOpenChange(false);
    onSaved?.();
  };

  const handleCnhUploaded = async (url: string) => {
    if (!clienteId) return;
    if (cnhDocId) {
      await supabase.from('clientes_fornecedores_documentos').update({ arquivo_url: url }).eq('id', cnhDocId);
    } else {
      const { data } = await supabase.from('clientes_fornecedores_documentos')
        .insert({ cliente_fornecedor_id: clienteId, tipo_documento: 'cnh', arquivo_url: url })
        .select('id').single();
      setCnhDocId(data?.id || null);
    }
    setCnhUrl(url);
  };

  const handleCnhRemoved = async () => {
    if (cnhDocId) {
      await supabase.from('clientes_fornecedores_documentos').delete().eq('id', cnhDocId);
      setCnhDocId(null);
    }
    setCnhUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Dados do Cliente</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="col-span-2">
              <Label>Nome / Razão Social <span className="text-destructive">*</span></Label>
              <Input value={nome} onChange={e => setNome(formatPersonNameInput(e.target.value))} />
            </div>
            <div>
              <Label>Telefone <span className="text-destructive">*</span></Label>
              <Input value={telefone} onChange={e => { const d = e.target.value.replace(/\D/g, ''); setTelefone(formatPhone(d)); }} maxLength={15} />
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <Input value={cpfCnpj} onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>Sexo</Label>
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{SEXOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>

            <div className="col-span-2 pt-2">
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-3 pb-1">Endereço</p>
            </div>
            <div>
              <Label>CEP</Label>
              <Input
                value={cep}
                onChange={e => setCep(formatCep(e.target.value))}
                onBlur={e => buscarCep(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
                disabled={buscandoCep}
              />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Logradouro</Label>
              <Input value={logradouro} onChange={e => setLogradouro(e.target.value)} />
            </div>
            <div>
              <Label>Complemento</Label>
              <Input value={complemento} onChange={e => setComplemento(e.target.value)} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={bairro} onChange={e => setBairro(e.target.value)} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={cidade} onChange={e => setCidade(e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="col-span-2 pt-2">
              <Separator />
              <p className="text-xs font-medium text-muted-foreground pt-3 pb-2">Documentos</p>
              <DocumentUpload
                label="CNH"
                currentUrl={cnhUrl}
                bucketPath={`docs/${clienteId}/cnh`}
                onUploaded={handleCnhUploaded}
                onRemoved={handleCnhRemoved}
              />
            </div>

            <div className="col-span-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClienteEditDialog;
