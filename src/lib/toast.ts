import { toast } from 'sonner';
import { messages } from './messages';

export function toastSuccess(message: string): void {
  toast.success(message);
}

export function toastError(error?: { code: string; message: string }): void {
  toast.error(error?.message ?? messages.common.unexpectedError);
}
