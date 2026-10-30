// Fixed diagnostics: never echo a parser exception, source payload or host path.
export function businessFeedback(error:unknown):string{
  const code=error instanceof Error?error.message:'';
  if(code.startsWith('图片无法解码'))return '图片无法解码，请重新导出有效的 PNG / JPEG / WebP';
  if(code.includes('cursor'))return '同步游标不连续或重复页内容冲突。请展开来源游标，按已应用游标重新拉取；不要跳页。';
  if(code.includes('upstream/local'))return '来源更新与本地覆盖冲突。请先导出备份，再在对应资料选择恢复来源并重新预检。';
  if(code.includes('version')||code.includes('stale preview'))return '资料版本已变化或回退。请关闭旧表单、重新读取并预检当前版本。';
  if(code.includes('reference')||code.includes('SKU mismatch')||code.includes('unknown product'))return '关联资料缺失或不属于同一来源。请先导入同店同来源的商品/客户，再重试。';
  if(code.includes('mapping'))return '客户会话映射重复或无效。一个虚构会话只能关联一位客户，请检查客户映射。';
  if(code.includes('identifier')||code.includes('duplicate store'))return 'ID无效或重复。请使用稳定且唯一的字母/数字开头ID，避免与现有资料重名。';
  if(code.includes('limit')||code.includes('byte')||code.includes('size'))return '资料超过数量或容量限制。请减少资料后重试；同步页1MiB、备份8MiB、单店1000条/6MiB。';
  if(code.includes('price')||code.includes('amount'))return '金额格式无效。请使用CNY两位以内小数，商品参考价例如 ¥39.90。';
  if(code.includes('backup format')||code.includes('schema'))return '文件版本不兼容。请使用本例schemaVersion 1的同步页或业务备份，勿手工拼接字段。';
  if(code.includes('bitmap')||code.includes('PNG')||code.includes('JPEG')||code.includes('WebP')||code.includes('图片'))return '图片无效或超限。请重新导出PNG/JPEG/WebP，单图128KiB、边长4096、400万像素内。';
  return '资料校验失败。请检查JSON格式、字段和ID；当前业务资料与游标保留。';
}
