export type AppDialogAction = {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppDialogOptions = {
  title: string;
  message?: string;
  actions?: AppDialogAction[];
};

type DialogPresenter = (options: AppDialogOptions) => void;

let presentDialog: DialogPresenter | null = null;

export const registerAppDialogPresenter = (presenter: DialogPresenter | null) => {
  presentDialog = presenter;
};

export const showAppDialog = (options: AppDialogOptions) => {
  if (presentDialog) {
    presentDialog(options);
    return;
  }

  const fallback = typeof console !== 'undefined' ? console.warn : () => {};
  fallback('App dialog presenter is not mounted yet.', options.title, options.message ?? '');
};

export const showAppAlert = (title: string, message?: string, actions?: AppDialogAction[]) => {
  showAppDialog({ title, message, actions });
};
