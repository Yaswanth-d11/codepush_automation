def greet(name):
    """Greets a person by name."""
    print(f"Greeting {name}...")
    return f"Hello, {name}!"


def add_numbers(a, b):
    """Adds two numbers together."""
    print(f"Adding {a} and {b}...")
    return a + b


def is_even(number):
    """Checks if a number is even."""
    return number % 2 == 0


def get_square(number):
    """Returns the square of a number."""
    return number ** 2


def reverse_string(text):
    """Reverses a string."""
    return text[::-1]


def calculate_area(length, width):
    """Calculates the area of a rectangle."""
    return length * width


# Example usage
if __name__ == "__main__":
    print(greet("Alice"))
    print(f"Sum: {add_numbers(5, 3)}")
    print(f"Is 4 even? {is_even(4)}")
    print(f"Square of 6: {get_square(6)}")
    print(f"Reversed: {reverse_string('Python')}")
    print(f"Area: {calculate_area(5, 4)}")

