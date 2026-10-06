// Layout das listagens de motos dos relatórios: o bloco "título + tabela" cabe
// numa tela só. Ao rolar a página até ele, o título e a listagem aparecem
// inteiros na altura da tela (descontando a barra de navegação fixa do
// celular), e a tabela rola por dentro com o cabeçalho congelado. Com poucas
// linhas o bloco não estica — só encolhe até caber.
//
// Cada nível entre a seção e a tabela precisa ser coluna flex com min-h-0
// para a altura máxima chegar até a área de rolagem da tabela.

/** Seção que envolve o título e o card da listagem. */
export const LISTAGEM_SECAO =
  '!mt-8 flex flex-col gap-2 min-h-0 max-h-[calc(100dvh-1.5rem)] max-md:max-h-[calc(100dvh-6rem)]';

/** Níveis intermediários (Card, CardContent, wrappers, abas). */
export const LISTAGEM_NIVEL = 'flex flex-col min-h-0';

/** Área de rolagem da tabela (passada em <Table maxHeightClassName>). */
export const LISTAGEM_TABELA = 'min-h-0';
