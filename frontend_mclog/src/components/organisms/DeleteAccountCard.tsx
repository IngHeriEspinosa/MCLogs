"use client";
import React, { useState } from "react";
import { Alert } from "@/components/atoms/Alert";
import { Button } from "@/components/atoms/Button";
import { Field } from "@/components/atoms/Field";
import { Input } from "@/components/atoms/Input";
import { Card } from "@/components/molecules/Card";
import { Dialog } from "@/components/molecules/Dialog";
import { errorMessage } from "@/common/api/errorMessage";
import { useI18n } from "@/common/i18n/I18nProvider";
import { CurrentUser, useDeleteAccount } from "@/hooks/useAuth";

/**
 * Baja de la propia cuenta. La cuenta root no la tiene: el backend lo rechaza
 * igualmente, pero aqui ni siquiera se ofrece.
 */
export const DeleteAccountCard: React.FC<{ user: CurrentUser }> = ({ user }) => {
  const { t } = useI18n();
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");

  const word = t.account.danger.confirmWord;
  const armed = typed.trim().toUpperCase() === word && password !== "" && (!user.twoFactorEnabled || code.trim() !== "");

  const close = () => {
    setOpen(false);
    setPassword("");
    setCode("");
    setTyped("");
    remove.reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!armed) return;
    remove.mutate({ password, code: user.twoFactorEnabled ? code.trim() : undefined });
  };

  return (
    <Card title={t.account.danger.title} description={t.account.danger.description} divider className="border-danger/30">
      {user.isRoot ? (
        <Alert variant="info">{t.account.danger.rootNotice}</Alert>
      ) : (
        <Button variant="danger" icon="trash" onClick={() => setOpen(true)}>
          {t.account.danger.delete}
        </Button>
      )}

      <Dialog
        open={open}
        onClose={close}
        dismissible={!remove.isPending}
        icon="alertCircle"
        title={t.account.danger.dialogTitle}
        description={t.account.danger.dialogBody(user.email)}
      >
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label={t.account.danger.password} info={t.fieldInfo.account.deletePassword}>
            <Input
              type="password"
              icon="lock"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {user.twoFactorEnabled && (
            <Field label={t.account.twoFactor.codeOrRecovery} info={t.fieldInfo.account.codeOrRecovery}>
              <Input icon="shield" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
            </Field>
          )}
          <Field label={t.account.danger.typeToConfirm(word)} info={t.fieldInfo.account.typeToConfirm(word)}>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" placeholder={word} required />
          </Field>
          {remove.isError && <Alert variant="error">{errorMessage(remove.error, t.common.unknownError)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button onClick={close} disabled={remove.isPending}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="danger" icon="trash" loading={remove.isPending} disabled={!armed}>
              {t.account.danger.confirm}
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
};
