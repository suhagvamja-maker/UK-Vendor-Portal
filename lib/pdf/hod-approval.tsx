import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { createHash } from 'node:crypto';

export interface HodApprovalData {
  submissionId: string;
  invoiceNumber: string;
  poNumber: string | null;
  amount: number;
  currency: string;
  vendorCompanyName: string | null;
  vendorCountry: string;
  vendorType: string;
  approverName: string | null;
  approverId: string;
  approverEmail: string;
  approvedAt: Date;
  version: number;
}

/**
 * Deterministic "digital signature reference" per CLAUDE.md §7:
 * SHA-256 of (approverId + ISO timestamp). Verifiable later by recomputing.
 */
export function approvalSignatureHash(approverId: string, approvedAt: Date): string {
  return createHash('sha256').update(`${approverId}:${approvedAt.toISOString()}`).digest('hex');
}

const styles = StyleSheet.create({
  page:  { padding: 48, fontFamily: 'Helvetica', fontSize: 11, color: '#0f172a' },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  sub:   { fontSize: 10, color: '#475569', marginBottom: 24 },
  h2:    { fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 8 },
  row:   { flexDirection: 'row', marginBottom: 4 },
  label: { width: 130, color: '#475569' },
  value: { flex: 1 },
  box:   {
    marginTop: 24,
    padding: 12,
    border: '1pt solid #cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  signature: {
    marginTop: 24,
    fontSize: 9,
    color: '#475569',
  },
  hash: { fontFamily: 'Courier', fontSize: 8, marginTop: 4, color: '#1e293b' },
});

export function HodApprovalDocument({ data }: { data: HodApprovalData }) {
  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency });
  const sig = approvalSignatureHash(data.approverId, data.approvedAt);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>HOD Approval</Text>
        <Text style={styles.sub}>
          Internal record of department-head sign-off — generated automatically on approval.
        </Text>

        <Text style={styles.h2}>Submission</Text>
        <View style={styles.row}><Text style={styles.label}>Invoice no.</Text><Text style={styles.value}>{data.invoiceNumber}</Text></View>
        {data.poNumber && (
          <View style={styles.row}><Text style={styles.label}>PO no.</Text><Text style={styles.value}>{data.poNumber}</Text></View>
        )}
        <View style={styles.row}><Text style={styles.label}>Amount</Text><Text style={styles.value}>{fmt.format(data.amount)}</Text></View>

        <Text style={styles.h2}>Vendor</Text>
        <View style={styles.row}><Text style={styles.label}>Name</Text><Text style={styles.value}>{data.vendorCompanyName ?? '—'}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Country</Text><Text style={styles.value}>{data.vendorCountry}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Type</Text><Text style={styles.value}>{data.vendorType}</Text></View>

        <View style={styles.box}>
          <Text>
            Approved by{' '}
            <Text style={{ fontWeight: 700 }}>{data.approverName ?? data.approverEmail}</Text>
            {' '}(HOD / Admin) on{' '}
            <Text style={{ fontWeight: 700 }}>
              {data.approvedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            </Text>
            .
          </Text>
        </View>

        <View style={styles.signature}>
          <Text>Submission ID: {data.submissionId}</Text>
          <Text>Approval version: {data.version}</Text>
          <Text>Signature reference (SHA-256):</Text>
          <Text style={styles.hash}>{sig}</Text>
        </View>
      </Page>
    </Document>
  );
}
