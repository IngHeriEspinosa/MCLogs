"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Tag } from "@/components/atoms/Tag";
import { Card } from "@/components/molecules/Card";
import { CopyButton } from "@/components/molecules/CopyButton";
import { Dialog } from "@/components/molecules/Dialog";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import {
  CurrentUser,
  TwoFactorSetup,
  useDisableTwoFactor,
  useEnableTwoFactor,
  useStartTwoFactor,
} from "@/hooks/useAuth";

/** Campo para el codigo de 6 digitos: teclado numerico y autocompletado de OTP. */
const OtpInput: React.FC<{ value: string; onChange: (value: string) => void; autoFocus?: boolean }> = ({
  value,
  onChange,
  autoFocus,
}) => (
  <Input
    icon="shield"
    value={value}
    onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="\d{6}"
    placeholder="000000"
    className="font-mono tracking-[0.3em]"
    autoFocus={autoFocus}
    required
  />
);

/** Codigos de recuperacion recien generados. Solo se cierra confirmando que se guardaron. */
const RecoveryCodesDialog: React.FC<{ codes: string[] | null; onClose: () => void }> = ({ codes, onClose }) => {
  const { t } = useI18n();
  return (
    <Dialog
      open={codes !== null}
      onClose={onClose}
      dismissible={false}
      icon="key"
      title={t.account.twoFactor.recoveryTitle}
      description={t.account.twoFactor.recoveryBody}
      footer={
        <>
          {codes && <CopyButton text={codes.join("\n")} label={t.common.copy} />}
          <Button variant="primary" icon="check" onClick={onClose}>
            {t.account.twoFactor.recoverySaved}
          </Button>
        </>
      }
    >
      {codes && (
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-code p-4">
          {codes.map((code) => (
            <li key={code} className="text-center font-mono text-sm text-code-ink">
              {code}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
};

const DisableDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n();
  const disable = useDisableTwoFactor();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const close = () => {
    setPassword("");
    setCode("");
    disable.reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await disable.mutateAsync({ password, code: code.trim() });
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      icon="shield"
      title={t.account.twoFactor.disableTitle}
      description={t.account.twoFactor.disableBody}
      size="sm"
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label={t.account.current} info={t.fieldInfo.account.current}>
          <Input
            type="password"
            icon="lock"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label={t.account.twoFactor.codeOrRecovery} info={t.fieldInfo.account.codeOrRecovery}>
          <Input icon="shield" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
        </Field>
        {disable.isError && <Alert variant="error">{errorMessage(disable.error, t.common.unknownError)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>{t.common.cancel}</Button>
          <Button type="submit" variant="danger" loading={disable.isPending}>
            {t.account.twoFactor.disable}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

/** Alta y baja del segundo factor (TOTP) desde la pagina de cuenta. */
export const TwoFactorCard: React.FC<{ user: CurrentUser }> = ({ user }) => {
  const { t } = useI18n();
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);

  const begin = async () => {
    enable.reset();
    setSetup(await start.mutateAsync());
  };

  const cancel = () => {
    setSetup(null);
    setCode("");
    enable.reset();
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    const codes = await enable.mutateAsync(code);
    setSetup(null);
    setCode("");
    setRecoveryCodes(codes);
  };

  const status = (
    <Tag tone={user.twoFactorEnabled ? "success" : "neutral"} icon={user.twoFactorEnabled ? "checkCircle" : undefined}>
      {user.twoFactorEnabled ? t.account.twoFactor.on : t.account.twoFactor.off}
    </Tag>
  );

  return (
    <Card title={t.account.twoFactor.title} description={t.account.twoFactor.description} actions={status} divider>
      {user.twoFactorEnabled ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">{t.account.twoFactor.onBody}</p>
          <Button icon="x" onClick={() => setDisabling(true)} className="self-start">
            {t.account.twoFactor.disable}
          </Button>
        </div>
      ) : setup ? (
        <form className="flex flex-col gap-4" onSubmit={confirm}>
          <p className="text-sm text-ink-2">{t.account.twoFactor.scan}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI generado por el backend */}
          <img src={setup.qrCode} alt="" width={176} height={176} className="h-44 w-44 self-center rounded-xl border border-line" />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-3">{t.account.twoFactor.manual}</span>
            <div className="flex items-center gap-2 rounded-xl bg-code p-2 pl-3.5">
              <code className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-code-ink">{setup.secret}</code>
              <CopyButton
                text={setup.secret}
                label={t.common.copy}
                variant="ghost"
                className="shrink-0 bg-white/10 text-[#d7e3e8] hover:bg-white/20 hover:text-white"
              />
            </div>
          </div>
          <Field label={t.account.twoFactor.enterCode} info={t.fieldInfo.account.enterCode}>
            <OtpInput value={code} onChange={setCode} autoFocus />
          </Field>
          {enable.isError && <Alert variant="error">{errorMessage(enable.error, t.common.unknownError)}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" icon="check" loading={enable.isPending} disabled={code.length !== 6}>
              {t.account.twoFactor.verify}
            </Button>
            <Button onClick={cancel}>{t.common.cancel}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">{t.account.twoFactor.offBody}</p>
          {start.isError && <Alert variant="error">{errorMessage(start.error, t.common.unknownError)}</Alert>}
          <Button variant="primary" icon="shield" onClick={begin} loading={start.isPending} className="self-start">
            {t.account.twoFactor.enable}
          </Button>
        </div>
      )}

      <RecoveryCodesDialog codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />
      <DisableDialog open={disabling} onClose={() => setDisabling(false)} />
    </Card>
  );
};
