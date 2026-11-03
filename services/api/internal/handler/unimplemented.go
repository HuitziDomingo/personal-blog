package handler

import (
	"context"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/handler/gen"
)

// unimplementedServer responde 501 en las operaciones del contrato que aún no
// tienen implementación. server lo embebe.
type unimplementedServer struct{}

func (unimplementedServer) ListPosts(context.Context, gen.ListPostsRequestObject) (gen.ListPostsResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) CreatePost(context.Context, gen.CreatePostRequestObject) (gen.CreatePostResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) DeletePost(context.Context, gen.DeletePostRequestObject) (gen.DeletePostResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) GetPost(context.Context, gen.GetPostRequestObject) (gen.GetPostResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) UpdatePost(context.Context, gen.UpdatePostRequestObject) (gen.UpdatePostResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) ListPublishedPosts(context.Context, gen.ListPublishedPostsRequestObject) (gen.ListPublishedPostsResponseObject, error) {
	return nil, errNotImplemented
}

func (unimplementedServer) GetPublishedPost(context.Context, gen.GetPublishedPostRequestObject) (gen.GetPublishedPostResponseObject, error) {
	return nil, errNotImplemented
}
