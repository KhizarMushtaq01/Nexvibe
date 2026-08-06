// frontend/src/context/DialogContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';

const DialogContext = createContext(null);

export const DialogProvider = ({ children }) => {
  const [request, setRequest] = useState(null);

  const confirmDialog = useCallback(({ title, message, danger, confirmLabel } = {}) =>
    new Promise((resolve) => setRequest({ title, message, danger, confirmLabel, showInput: false, resolve })), []);

  const promptDialog = useCallback(({ title, inputPlaceholder } = {}) =>
    new Promise((resolve) => setRequest({ title, showInput: true, inputPlaceholder, resolve })), []);

  const close = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      <ConfirmDialog
        open={!!request}
        title={request?.title}
        message={request?.message}
        danger={request?.danger}
        confirmLabel={request?.confirmLabel}
        showInput={request?.showInput}
        inputPlaceholder={request?.inputPlaceholder}
        onConfirm={(value) => close(request?.showInput ? value : true)}
        onCancel={() => close(request?.showInput ? null : false)}
      />
    </DialogContext.Provider>
  );
};

export const useConfirm = () => useContext(DialogContext).confirmDialog;
export const usePrompt = () => useContext(DialogContext).promptDialog;
