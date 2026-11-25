package main

import "time"

// oldPost es un post de la web anterior (HuitziDomingo/next-chakraUI, commit
// d627669), ya pasado a Markdown en docs/web/posts-migrados/ (BLOG-075).
type oldPost struct {
	slug    string
	title   string
	excerpt string
	tags    []string
	// cover es la imagen de portada dentro de apps/web/public; el Markdown
	// empieza con ella.
	cover string
	// created es la fecha del commit que creó la página en la web anterior,
	// que no guardaba fecha de publicación; updated, la de su último cambio.
	created time.Time
	updated time.Time
}

// cst es la zona de los commits de la web anterior (-06:00).
var cst = time.FixedZone("-0600", -6*60*60)

// oldPosts son los 2 posts de la web anterior. Título, extracto y tags salen
// de docs/web/posts-migrados/README.md; las fechas, del historial de git de
// pages/blog/<slug>.js.
var oldPosts = []oldPost{
	{
		slug:    "arreglos",
		title:   "Métodos de Array",
		excerpt: "Si eres un programador backend o frontend en JavaScript o TypeScript, es muy usual trabajar con arreglos; aquí te invito a conocer algunos de sus métodos para que puedas manipularlos.",
		tags:    []string{"javascript", "typescript"},
		cover:   "img/blog/arreglos-portada.webp",
		created: time.Date(2023, 5, 16, 18, 22, 21, 0, cst),
		updated: time.Date(2023, 5, 24, 23, 11, 57, 0, cst),
	},
	{
		slug:    "backend-api",
		title:   "Configurando un Backend con Express, MongoDB, Typescript y Docker",
		excerpt: "Hola, amigo: este tutorial es para que puedas aprender a configurar tu backend con las tecnologías del stack MERN.",
		tags:    []string{"express", "mongodb", "typescript", "docker"},
		cover:   "img/blog/arreglos-portada.webp",
		created: time.Date(2023, 5, 24, 23, 11, 57, 0, cst),
		updated: time.Date(2023, 5, 26, 16, 10, 19, 0, cst),
	},
}
