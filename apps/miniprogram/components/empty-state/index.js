Component({
  properties: {
    title: { type: String, value: '今天校园里还没有内容' },
    sub: { type: String, value: '去拍一张晚霞，或写一句吐槽。' },
    actionText: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
