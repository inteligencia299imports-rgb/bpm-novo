import * as React from "react";

/**
 * Fecha o Popover mais próximo. Usado pelo Calendar pra fechar o seletor de
 * data assim que o dia é clicado (sem precisar clicar fora). null = fora de Popover.
 */
export const PopoverCloseContext = React.createContext<(() => void) | null>(null);

export const usePopoverClose = () => React.useContext(PopoverCloseContext);
