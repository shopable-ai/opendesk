
function notify(options) {
    if (typeof options === 'string') {
      options = {
        title: options,
        message: "",
        sound: true
      };
    } else if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('notify expects a string or an options object');
    }

    return notify____Inject(options);
}
