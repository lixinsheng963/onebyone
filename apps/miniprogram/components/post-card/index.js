Component({
  properties: {
    post: { type: Object, value: {} }
  },
  methods: {
    onOpen() {
      this.triggerEvent('open', { id: this.data.post.id });
    },
    onLike() {
      this.triggerEvent('like', { id: this.data.post.id });
    },
    onComment() {
      this.triggerEvent('comment', { id: this.data.post.id });
    },
    onFavorite() {
      this.triggerEvent('favorite', { id: this.data.post.id });
    },
    onMore() {
      this.triggerEvent('more', { id: this.data.post.id });
    }
  }
});
