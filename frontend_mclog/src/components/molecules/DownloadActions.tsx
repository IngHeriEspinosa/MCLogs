import React from "react";
import { PrimaryButton } from "@/components/atoms/PrimaryButton";

export const DownloadActions: React.FC<{ onCsv: () => void; onNdjson: () => void }> = ({ onCsv, onNdjson }) => (
  <div className="flex gap-2">
    <PrimaryButton type="button" onClick={onCsv}>
      CSV
    </PrimaryButton>
    <PrimaryButton type="button" onClick={onNdjson}>
      NDJSON
    </PrimaryButton>
  </div>
);
