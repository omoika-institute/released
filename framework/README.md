## Introducing the OMOIKA `framework`

<p>
  <a href="https://github.com/omoika-institute/omoika">
    <img src="./watermark.svg" height="360px" alt="OMOIKA Logo">
  </a>

> _I have no data yet. It is a capital mistake to theorize before one has data. Insensibly
> one begins to twist facts to suit theories, instead of theories to suit facts._

---

<details>
  <summary>📼 <i>Click here to watch the <b>OMOIKA</b> video demo</i>.</summary>

[demo.mp4](https://github.com/user-attachments/assets/561cdcf0-5a10-48bb-ad79-c911036697fa)

</details>

---

# The OMOIKA Plugins Framework

[![PyPI version](https://badge.fury.io/py/omoika.svg)](https://pypi.org/project/omoika/)
[![Python 3.13+](https://img.shields.io/badge/python-3.13+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![hits](https://komarev.com/ghpvc/?username=omoika-institute-17491-framework&label=hits)

Welcome to the OMOIKA project where you can connect, combine,
and get insight from unstructured and public data as results that
can be explored step-by-step. An easy-to-use plugin system allows any
developer to quickly integrate new data sources so you can focus
on discovering, interacting, and visualizing what's important to you

This is the plugin framework for [OMOIKA](https://github.com/omoika-institute/omoika), a graph-based OSINT platform for recon, OSINT investigations, link analysis, and more. Offline. Local-first workflows. No cloud dependency required.

## Overview

OMOIKA's plugin system enables you to define **entities** (_nodes in the graph_) and **transforms** (_operations that create new entities from existing ones_). The framework provides:

- **Entity definitions** with rich metadata, icons, colors, and form elements
- **Transform decorators** with dependency management and version targeting
- **Result types** for subgraphs, custom edges, and file attachments
- **Field types** for semantic type-based transform matching
- **Settings framework** for persistent configuration
- **CLI tools** for development and integration

## Installation

```bash
pip install omoika[all]
```

For development:

```bash
git clone https://github.com/omoika-institute/framework.git
cd framework/
pip install -e ".[dev]"
```

## Quick Start

### Define an Entity

```python
from omoika import Plugin
from omoika.elements import TextInput, Copy
from omoika.types import FieldType

class EmailEntity(Plugin):
    version = "1.0.0"
    label = "Email"
    icon = "mail"
    color = "#3B82F6"
    category = "Identity"

    elements = [
        TextInput(label="Email", icon="mail", field_type=FieldType.EMAIL),
        Copy(label="Domain"),
    ]
```

### Create a Transform

```python
from omoika import transform, Entity, Edge

@transform(
    target="email@>=1.0.0",
    label="Extract Domain",
    icon="world",
)
async def extract_domain(entity):
    email = entity.email
    domain = email.split("@")[1] if "@" in email else None

    if domain:
        return Entity(
            data=DomainEntity.blueprint(domain=domain),
            edge=Edge(label="has domain"),
        )
```

### Run a Transform

```bash
omoika run -T '{"label": "email", "version": "1.0.0", "transform": "extract_domain", "data": {"email": "user@example.com"}}'
```

## Documentation

| Guide                                      | Description                                         |
| ------------------------------------------ | --------------------------------------------------- |
| [Getting Started](docs/getting-started.md) | Installation, project setup, and first plugin       |
| [Plugins & Entities](docs/plugins.md)      | Defining entities with the Plugin class             |
| [Transforms](docs/transforms.md)           | Creating transforms with the `@transform` decorator |
| [Elements](docs/elements.md)               | Input and display elements for entity forms         |
| [Field Types](docs/types.md)               | Semantic types for fields and type-based matching   |
| [Settings](docs/settings.md)               | Transform configuration and persistence             |
| [CLI Reference](docs/cli.md)               | Command-line interface documentation                |
| [API Reference](docs/api-reference.md)     | Complete API documentation                          |

## Key Concepts

### Plugins & Entities

Every node type in the graph is defined as a `Plugin` subclass. Plugins are automatically registered when defined:

```python
class IPAddress(Plugin):
    version = "1.0.0"
    label = "IP Address"
    elements = [TextInput(label="IP", field_type=FieldType.IP_ADDRESS)]
```

### Transforms

Transforms operate on entities to produce new entities. They target specific entity versions:

```python
@transform(target="ip_address@>=1.0.0", label="GeoIP Lookup", deps=["geoip2"])
async def geoip_lookup(entity):
    # Transform logic
    return Entity(data=Location.blueprint(city="..."))
```

### Result Types

Transforms return `Entity`, `Edge`, `File`, or `Subgraph` objects:

```python
return Entity(
    data=TargetEntity.blueprint(field="value"),
    edge=Edge(label="discovered", color="#22C55E"),
    files=[File(path="/tmp/report.pdf")],
)
```

## Project Structure

For plugin development and registry submissions, organize your code as:

```
my-plugins-repo/
├── entities/
│   ├── email.py
│   ├── domain.py
│   └── ip_address.py
└── transforms/
    ├── email_transforms.py
    ├── domain_transforms.py
    ├── network_traceroute_transform.py
    └── network_transforms.py
```

Load plugins via:

```python
from omoika import load_plugins_fs
load_plugins_fs("/path/to/my-plugins", "my_plugins")
```

## CLI Commands

```bash
# List entities and transforms
omoika ls entities
omoika ls transforms -L email

# Run a transform
omoika transform '{"label": "email", "version": "1.0.0", "transform": "to_domain", "data": {...}}'

# Get entity blueprints
omoika blueprints -L email

# Initialize a new plugins project
omoika init

# Sync manifest and README metadata after repo changes
omoika sync

# Compile JSON entity to Python
omoika compile entity.json -O entity.py
```

## Requirements

- Python 3.13+

## License

MIT License, see [LICENSE](LICENSE) for details.

## Links

- [Documentation](https://omoika.institute/)
- [OMOIKA Application](https://github.com/omoika-institute/omoika)
- [Issue Tracker](https://github.com/omoika-institute/omoika/issues)
