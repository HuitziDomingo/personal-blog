// Package handler expone la API por HTTP con Gin.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// NewRouter crea el router HTTP con las rutas de la API.
func NewRouter() *gin.Engine {
	router := gin.Default()
	router.GET("/health", health)

	return router
}

// health es la comprobación de liveness; no consulta dependencias externas.
func health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
