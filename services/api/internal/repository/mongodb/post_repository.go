package mongodb

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/HuitziDomingo/personal-blog/services/api/internal/domain"
)

const postsCollection = "posts"

var _ domain.PostRepository = (*PostRepository)(nil)

// postDocument es la forma en que se guarda un post en MongoDB.
type postDocument struct {
	ID          bson.ObjectID `bson:"_id"`
	AuthorID    string        `bson:"author_id"`
	Title       string        `bson:"title"`
	Slug        string        `bson:"slug"`
	Excerpt     string        `bson:"excerpt"`
	Content     string        `bson:"content"`
	Tags        []string      `bson:"tags"`
	Status      string        `bson:"status"`
	SEO         seoDocument   `bson:"seo"`
	PublishedAt *time.Time    `bson:"published_at"`
	CreatedAt   time.Time     `bson:"created_at"`
	UpdatedAt   time.Time     `bson:"updated_at"`
}

// seoDocument es el subdocumento con los metadatos SEO de un post.
type seoDocument struct {
	Title        string   `bson:"title"`
	Description  string   `bson:"description"`
	Keywords     []string `bson:"keywords"`
	CanonicalURL string   `bson:"canonical_url"`
	OGImageURL   string   `bson:"og_image_url"`
}

func toPostDocument(post *domain.Post, id bson.ObjectID) postDocument {
	return postDocument{
		ID:          id,
		AuthorID:    post.AuthorID,
		Title:       post.Title,
		Slug:        post.Slug,
		Excerpt:     post.Excerpt,
		Content:     post.Content,
		Tags:        nonNilStrings(post.Tags),
		Status:      string(post.Status),
		SEO:         toSEODocument(post.SEO),
		PublishedAt: post.PublishedAt,
		CreatedAt:   post.CreatedAt,
		UpdatedAt:   post.UpdatedAt,
	}
}

func toSEODocument(seo domain.SEO) seoDocument {
	return seoDocument{
		Title:        seo.Title,
		Description:  seo.Description,
		Keywords:     nonNilStrings(seo.Keywords),
		CanonicalURL: seo.CanonicalURL,
		OGImageURL:   seo.OGImageURL,
	}
}

func toDomainPost(document postDocument) *domain.Post {
	post := &domain.Post{
		ID:       document.ID.Hex(),
		AuthorID: document.AuthorID,
		Title:    document.Title,
		Slug:     document.Slug,
		Excerpt:  document.Excerpt,
		Content:  document.Content,
		Tags:     nonNilStrings(document.Tags),
		Status:   domain.PostStatus(document.Status),
		SEO: domain.SEO{
			Title:        document.SEO.Title,
			Description:  document.SEO.Description,
			Keywords:     nonNilStrings(document.SEO.Keywords),
			CanonicalURL: document.SEO.CanonicalURL,
			OGImageURL:   document.SEO.OGImageURL,
		},
		CreatedAt: document.CreatedAt.UTC(),
		UpdatedAt: document.UpdatedAt.UTC(),
	}

	if document.PublishedAt != nil {
		publishedAt := document.PublishedAt.UTC()
		post.PublishedAt = &publishedAt
	}

	return post
}

// nonNilStrings guarda las listas vacías como [] y no como null.
func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}

// PostRepository implementa domain.PostRepository sobre MongoDB.
type PostRepository struct {
	posts *mongo.Collection
}

// NewPostRepository crea el repositorio de posts.
func NewPostRepository(client *Client) *PostRepository {
	return &PostRepository{posts: client.database.Collection(postsCollection)}
}

// Create guarda el post y le asigna un ID nuevo.
func (r *PostRepository) Create(ctx context.Context, post *domain.Post) error {
	id := bson.NewObjectID()

	if _, err := r.posts.InsertOne(ctx, toPostDocument(post, id)); err != nil {
		return fmt.Errorf("create post: %w", translatePostWriteError(err))
	}

	post.ID = id.Hex()

	return nil
}

// GetByID devuelve el post con ese ID, en cualquier estado. Un ID con formato
// inválido no puede existir, así que también devuelve domain.ErrNotFound.
func (r *PostRepository) GetByID(ctx context.Context, id string) (*domain.Post, error) {
	objectID, err := bson.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("get post by id: %w", domain.ErrNotFound)
	}

	post, err := r.findOne(ctx, bson.D{{Key: "_id", Value: objectID}})
	if err != nil {
		return nil, fmt.Errorf("get post by id: %w", err)
	}

	return post, nil
}

// GetBySlug devuelve el post con ese slug, en cualquier estado.
func (r *PostRepository) GetBySlug(ctx context.Context, slug string) (*domain.Post, error) {
	post, err := r.findOne(ctx, bson.D{{Key: "slug", Value: slug}})
	if err != nil {
		return nil, fmt.Errorf("get post by slug: %w", err)
	}

	return post, nil
}

// List devuelve una página de posts y el total que cumple el filtro. Limit
// debe ser positivo: ningún listado devuelve la colección completa.
func (r *PostRepository) List(ctx context.Context, filter domain.PostFilter) ([]*domain.Post, int64, error) {
	if filter.Limit <= 0 || filter.Offset < 0 {
		return nil, 0, fmt.Errorf("list posts: limit %d, offset %d: %w", filter.Limit, filter.Offset, domain.ErrInvalidInput)
	}

	query := postListQuery(filter)

	total, err := r.posts.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, fmt.Errorf("count posts: %w", err)
	}

	findOptions := options.Find().
		SetSort(postListSort(filter.Order)).
		SetSkip(int64(filter.Offset)).
		SetLimit(int64(filter.Limit))

	cursor, err := r.posts.Find(ctx, query, findOptions)
	if err != nil {
		return nil, 0, fmt.Errorf("list posts: %w", err)
	}

	var documents []postDocument
	if err := cursor.All(ctx, &documents); err != nil {
		return nil, 0, fmt.Errorf("decode posts: %w", err)
	}

	posts := make([]*domain.Post, 0, len(documents))
	for _, document := range documents {
		posts = append(posts, toDomainPost(document))
	}

	return posts, total, nil
}

// Update guarda los datos editables del post; author_id y created_at no cambian.
func (r *PostRepository) Update(ctx context.Context, post *domain.Post) error {
	objectID, err := bson.ObjectIDFromHex(post.ID)
	if err != nil {
		return fmt.Errorf("update post: %w", domain.ErrNotFound)
	}

	result, err := r.posts.UpdateByID(ctx, objectID, bson.D{{Key: "$set", Value: bson.D{
		{Key: "title", Value: post.Title},
		{Key: "slug", Value: post.Slug},
		{Key: "excerpt", Value: post.Excerpt},
		{Key: "content", Value: post.Content},
		{Key: "tags", Value: nonNilStrings(post.Tags)},
		{Key: "status", Value: string(post.Status)},
		{Key: "seo", Value: toSEODocument(post.SEO)},
		{Key: "published_at", Value: post.PublishedAt},
		{Key: "updated_at", Value: post.UpdatedAt},
	}}})
	if err != nil {
		return fmt.Errorf("update post: %w", translatePostWriteError(err))
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("update post: %w", domain.ErrNotFound)
	}

	return nil
}

func (r *PostRepository) findOne(ctx context.Context, filter bson.D) (*domain.Post, error) {
	var document postDocument

	err := r.posts.FindOne(ctx, filter).Decode(&document)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, domain.ErrNotFound
	}

	if err != nil {
		return nil, err
	}

	return toDomainPost(document), nil
}

// postListQuery construye el filtro de Mongo solo con los campos tipados de
// domain.PostFilter; nunca con datos de la petición sin tipar (ADR-010).
func postListQuery(filter domain.PostFilter) bson.D {
	query := bson.D{}

	if filter.Status != "" {
		query = append(query, bson.E{Key: "status", Value: string(filter.Status)})
	}

	if filter.Tag != "" {
		query = append(query, bson.E{Key: "tags", Value: filter.Tag})
	}

	return query
}

// postListSort desempata por _id para que la paginación sea estable cuando
// dos posts tienen la misma fecha.
func postListSort(order domain.PostOrder) bson.D {
	field := "updated_at"
	if order == domain.PostOrderPublishedDesc {
		field = "published_at"
	}

	return bson.D{{Key: field, Value: -1}, {Key: "_id", Value: -1}}
}

func postIndexes() []mongo.IndexModel {
	return []mongo.IndexModel{
		{Keys: bson.D{{Key: "slug", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "published_at", Value: -1}, {Key: "_id", Value: -1}}},
	}
}

// translatePostWriteError traduce la clave duplicada al error del dominio. El
// único índice único de la colección, aparte de _id, es el de slug.
func translatePostWriteError(err error) error {
	if mongo.IsDuplicateKeyError(err) {
		return domain.ErrDuplicateSlug
	}

	return err
}
