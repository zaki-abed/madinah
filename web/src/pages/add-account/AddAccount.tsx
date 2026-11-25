import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../../styles/add-account.css';
import { AddAccountView } from './AddAccountView';
import { useAddAccount } from './useAddAccount';

/** صفحة «إضافة حساب جديد» (لوحة AddAccount.dc.html). ‎?provider=‎ يختار الجهة مسبقاً. */
export function AddAccount() {
  const [params] = useSearchParams();
  const vm = useAddAccount(params.get('provider'));

  useEffect(() => {
    document.title = 'إضافة حساب جديد · مكتب المدينة';
  }, []);

  return <AddAccountView vm={vm} />;
}
