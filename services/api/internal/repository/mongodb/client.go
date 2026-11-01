// Package mongodb implementa la persistencia de la API sobre MongoDB.
package mongodb

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

const connectTimeout = 5 * time.Second

// Client es la conexión a una base de datos de MongoDB.
type Client struct {
	database *mongo.Database
}

// Connect abre la conexión y comprueba que MongoDB responde.
func Connect(ctx context.Context, uri, dbName string) (*Client, error) {
	mongoClient, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("connect to mongo: %w", err)
	}

	client := &Client{database: mongoClient.Database(dbName)}

	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()

	if err := client.Ping(pingCtx); err != nil {
		return nil, errors.Join(err, client.Disconnect(ctx))
	}

	return client, nil
}

// Ping comprueba que MongoDB responde.
func (c *Client) Ping(ctx context.Context) error {
	if err := c.database.Client().Ping(ctx, readpref.Primary()); err != nil {
		return fmt.Errorf("ping mongo: %w", err)
	}

	return nil
}

// Disconnect cierra la conexión con MongoDB.
func (c *Client) Disconnect(ctx context.Context) error {
	if err := c.database.Client().Disconnect(ctx); err != nil {
		return fmt.Errorf("disconnect from mongo: %w", err)
	}

	return nil
}
