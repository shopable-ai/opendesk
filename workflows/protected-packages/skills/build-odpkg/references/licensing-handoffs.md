# License and activation handoffs

仅在受保护包已通过独立 inspect/verify 且用户要求 P1 或 P2 授权交接时读取。package publisher signing key、
License/entitlement issuer signing key 与 DEK 分开保管；客户只接收需要的 public key、package 和授权材料。

## P1 device-bound offline

客户设备先导出 public identity；设备 private key 留在 macOS Keychain 或当前用户 Windows DPAPI owner：

```bash
./dist/opendesk license device -o path/to/device-public.json
```

Publisher 使用客户 public identity、package DEK 和独立 License issuer private-key 文件签发：

```bash
./dist/opendesk license issue path/to/recipe.odpkg --device path/to/device-public.json --content-key path/to/recipe.key --signing-key path/to/license-issuer-private.pem --license-id license-example --subject-id customer-example --issuer-key-id license-key-example --expires-at 2027-01-01T00:00:00Z -o path/to/recipe.odlicense
```

`--expires-at` 和可选 `--issued-at` 必须是 canonical UTC RFC3339。`issue` 会证明 DEK 能解密 package；它不会
替代先前的 publisher signature verify。`.odlicense` 输出必须是全新路径，CLI 以 0600 exclusive-create 写入。

客户侧检查、设备绑定验证和安装：

```bash
./dist/opendesk license inspect path/to/recipe.odlicense
./dist/opendesk license verify path/to/recipe.odlicense --issuer-key path/to/license-issuer-public.pem
./dist/opendesk license install path/to/recipe.odlicense --package path/to/recipe.odpkg --package-publisher-key path/to/publisher-public.pem --issuer-key path/to/license-issuer-public.pem
```

`inspect` 只投影安全 metadata。`verify` 还验证当前设备绑定和 DEK 可访问性；`install` 会写当前用户的 License、
public-key pins，并使用 OS device key 证明 package 可解密。除非用户明确授权修改该客户安装，否则只提供交接
命令和前置条件，不代为 install。`OPENDESK_PROTECTED_RECIPE_ROOT` 只移动 License/public pins；不能把设备
private key 导出到该目录。

## P2 online activation

P2 是客户设备与 entitlement service 的状态变更，不是 Publisher package verify 的附带步骤。只从 file-only
`--token-file` 读取 bearer credential：

```bash
./dist/opendesk license activate path/to/recipe.odpkg --service https://licenses.example.com --token-file path/to/activation.token --package-publisher-key path/to/publisher-public.pem --issuer-key path/to/license-issuer-public.pem
./dist/opendesk license status path/to/recipe.odpkg
./dist/opendesk license refresh path/to/recipe.odpkg --service https://licenses.example.com --token-file path/to/activation.token
./dist/opendesk license deactivate path/to/recipe.odpkg --service https://licenses.example.com --token-file path/to/activation.token
```

私有 CA 只能用 `--ca-file path/to/private-ca.pem` 扩展 system roots；不得关闭 hostname/certificate verification。
`status` 不访问网络，也不接受 token/CA 参数。activate/refresh/deactivate 需要明确的外部服务和本地状态修改授权；
deactivate 还会释放服务端 device slot。不要在仅要求 packaging 时执行。

只有 `activate` 安装的 signed cache、package/device binding、DEK unwrap 与 decrypt 都通过后才能报告 online
authorized。服务不可用不会延长 signed offline deadline；cache rollback、删除、tamper 或 revoked resurrection
均 fail closed。仓库 reference entitlement server 只是 TLS/in-memory acceptance tool，不是 production SaaS。
