import { COMPANY_NAME_MASTER } from "@/app/lib/companyNames/master";

// 日経225の構成銘柄のうち、確度の高い主要銘柄のみを収録したスターターセット（約30銘柄）。
// 日経225は定期的に構成銘柄の入れ替えが行われるため、全225銘柄を正確に維持するには
// JPX（日本取引所グループ）または日本経済新聞社の公式最新リストを参照してこの配列に追加してください。
// 銘柄名（日本語）は app/lib/companyNames/master.ts で一元管理する。
export const NIKKEI225_CODES: string[] = Object.keys(COMPANY_NAME_MASTER);
