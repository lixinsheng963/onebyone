Component({
  data: { menuId: '' },
  properties: {
    comment: { type: Object, value: {} }
  },
  methods: {
    onReply(e) {
      const replyId = e.currentTarget.dataset.replyId;
      const replies = this.data.comment.replies || [];
      const target = (replyId && replies.find((item) => item.id === replyId)) || this.data.comment;
      this.triggerEvent('reply', {
        rootId: this.data.comment.id,
        comment: target
      });
    },
    onMenu(e) {
      const id = e.currentTarget.dataset.id;
      this.setData({ menuId: this.data.menuId === id ? '' : id });
    },
    onReport(e) {
      const id = e.currentTarget.dataset.id;
      const kind = e.currentTarget.dataset.kind;
      const replies = this.data.comment.replies || [];
      const target = kind === 'reply' && id ? replies.find((item) => item.id === id) : this.data.comment;
      this.setData({ menuId: '' });
      this.triggerEvent('report', { comment: target || this.data.comment });
    }
  }
});
