declare global {

    /**
     * 对字符串进行 encodeURIComponent 编码。
     * @param str 要编码的字符串。
     * @returns 编码后的字符串。
     */
    function encodeURIComponent(str: string): string;

    /**
     * 对 URI 进行 encodeURI 编码。
     * @param uri 要编码的 URI。
     * @param allowedChars 允许的字符集。
     * @returns 编码后的 URI。
     */
    function encodeURI(uri: string, allowedChars: string): string;

    /**
     * 对字符串进行 decodeURIComponent 解码。
     * @param str 要解码的字符串。
     * @returns 解码后的字符串。
     */
    function decodeURIComponent(str: string): string;

    /**
     * 对 URI 进行 decodeURI 解码。
     * @param uri 要解码的 URI。
     * @returns 解码后的 URI。
     */
    function decodeURI(uri: string): string;

    
    /**
     * 将给定的文本复制到设备的剪贴板。
     * @param text 要复制到剪贴板的文本。
     */
    function copyToClipboard(text: string): void;

    /**
     * 获取设备剪贴板当前的内容。
     * @returns 剪贴板当前的内容。
     */
    function getClipboard(): string;

    async function sleep(ms: number): Promise<void>;
}

// 使文件成为模块
export {};