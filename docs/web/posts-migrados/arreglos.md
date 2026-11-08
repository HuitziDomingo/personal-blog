![Fragmento de código JavaScript con las funciones arrayConcat y arrayPush](/img/blog/arreglos-portada.webp)

Si eres un programador backend o frontend en JavaScript o TypeScript, es muy usual trabajar con arreglos; aquí te invito a conocer algunos de sus métodos para que puedas manipularlos.

En este post revisaremos varios de sus métodos de uso. Sin más introducción, empecemos.

## Método `.push()`

Agrega un nuevo elemento al final del arreglo y retorna una nueva longitud en el mismo.

```ts
export function arrayPush() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    fruits.push('papaya')

    fruits.map(fruit => console.log(fruit)) // <- manzana, platano, mango, durazno, papaya
}
```

## Método `.concat()`

Concatena 2 o más arreglos y devuelve un nuevo arreglo con los valores concatenados.

```ts
export function arrayConcat() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    let vegetables = ['verengena', 'calabaza', 'zanahoria', 'lechuga']

    let fruitsAndVegetables = fruits.concat(vegetables)

    fruitsAndVegetables.map(fv => console.log(fv)) // <- manzana, platano, mango, durazno, verengena, calabaza, zanahoria, lechuga
}
```

## Método `.pop()`

Remueve el último elemento de un arreglo.

```ts
export function arrayPop() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    fruits.pop()
    fruits.map(fruit => console.log(fruit)) // <- manzana, platano, mango
}
```

## Método `.filter()`

Crea un nuevo arreglo filtrando los datos según la condición; en su versión más profesional, este método llega a tener hasta 3 argumentos.

```ts
export function arrayFilter() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    let newFruits = fruits.filter(fruit => fruit !== 'manzana' && fruit !== 'platano')
    newFruits.map(fruit => console.log(fruit)) // <- mango, durazno
}
```

## Método `.shift()`

Remueve el primer elemento de un arreglo y retorna el elemento removido.

```ts
export function arrayShift() { 
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    let firstFruit = fruits.shift()
    console.log(firstFruit) // <- manzana
}
```

## Método `.unshift()`

Agrega elementos nuevos al inicio de un arreglo.

```ts
export function arrayUnShift() { 
    let numbers = [40, 50, 60, 70, 80]
    let addNumbersToStart = numbers.unshift(10, 20, 30)
    console.log(addNumbersToStart) // <- 8
    numbers.map(nums => console.log(nums)) // <- 10, 20, 30, 40, 50, 60, 70, 80
}
```

## Método `.map()`

Nos ayuda a recorrer arreglos, e incluso arreglos con objetos, accediendo directamente a sus propiedades del mismo.

```ts
export function arrayMap() {
    let users = [
        { name: 'Juan', age: 36 },
        { name: 'Maria', age: 26 },
        { name: 'Angela', age: 23 },
    ]

    users.map(user => console.log(user.name, user.age)) // <- Juan 36, Maria 26, Angela 23
}
```

## Método `.slice()`

Nos retorna los elementos seleccionados, específicamente.

```ts
export function arraySlice() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    let newFruit = fruits.slice(0, 3) 
    console.log(newFruit) // <- ['manzana', 'platano', 'mango']
}
```

## Método `.sort()`

Acomoda el contenido del arreglo de mayor a menor o, dicho de otra manera, de forma ascendente.

```ts
export function arraySort() {
    let nums = [3, 2, 4, 1]
    nums.sort()
    console.log(nums) // <- [1, 2, 3, 4]
}
```

## Método `.join()`

Une el contenido del arreglo en un string, separándolo por un separador específico.

```ts
export function arrayJoin() {
    let fruits = ['manzana', 'platano', 'mango', 'durazno']
    console.log(fruits.join('-')) // <- manzana-platano-mango-durazno
}
```

## Método `.toString()`

Convierte todo nuestro arreglo en una cadena de texto (string).

```ts
export function arrayToString() {
    let fruits = ['manzana', 1, 'mango', 3]
    console.log(fruits.toString()) // <- manzana, 1, mango, 3
}
```

Como podemos observar, son bastantes los métodos que utilizan los arrays, y es probable que con el tiempo existan más y mejores. Me entusiasma ver lo que nos depara el futuro.
