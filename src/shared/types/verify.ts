// 一键验证结果（main/verify 产出）：pass=true 通过 / false 未生效 / null 无法自动判定。
export interface VerifyResult {
  ok: boolean;
  msg?: string;
  pass?: boolean | null;
  before?: string;
  after?: string;
  detail?: string;
}
