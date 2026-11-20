import sampleJson from "@/data/sample-pack.json";
import { validatePack, type Pack } from "@/lib/domain/pack";

/** 開発用のサンプルパック（架空の英文）。検証を通らなければ起動時に気づけるよう例外にする。 */
export const SAMPLE_PACK: Pack = (() => {
  const r = validatePack(sampleJson);
  if (!r.ok) throw new Error("サンプルパックが不正です: " + JSON.stringify(r.errors));
  return r.pack;
})();
