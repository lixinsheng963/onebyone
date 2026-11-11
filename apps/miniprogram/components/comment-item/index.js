Component({
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
    onReport() {
      this.triggerEvent('report', { comment: this.data.comment });
    }
  }
});
