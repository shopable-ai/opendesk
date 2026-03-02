
function notify(options) {
    // 检查参数类型
    if (typeof options === 'string') {
      // 如果是字符串，转换为对象
      options = {
        title: options,
        message: "",   // 可以根据需要设置默认值
        sound: true,   // 默认值
        timeout: 5000  // 默认值，5000毫秒
      };
    }
    
    notify____Inject(options);
}