import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Subir documentos" };

export default function UploadPage() {
  return (
    <>
      <PageTitle action={<Link href="/revisar" className="text-sm font-medium text-brand">Por revisar</Link>}>
        Subir documentos
      </PageTitle>
      <p className="mb-4 text-muted">
        La IA lee tus documentos y propone los movimientos. Nada se guarda hasta que tú lo revises.
      </p>
      <Uploader />
      <ul className="mt-6 space-y-1 text-sm text-muted">
        <li>📷 Fotos de boletas, facturas o comprobantes (JPG, PNG; HEIC se convierte solo)</li>
        <li>📄 PDF de cartolas de tarjeta o cuenta, cuentas de servicios, liquidaciones de sueldo</li>
        <li>📊 Excel (.xlsx) o CSV descargados desde la web del banco</li>
        <li>🔒 Tus archivos quedan privados: solo los ve tu hogar.</li>
      </ul>
    </>
  );
}
