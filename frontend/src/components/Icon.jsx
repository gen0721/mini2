/**
 * Icon.jsx — единый компонент иконок на базе Lucide React
 * Использование: <Icon name="wallet" size={20} color="var(--accent)" />
 */
import {
  Wallet, ShieldCheck, Handshake, LayoutGrid, Home, Plus,
  User, LogOut, Settings, Star, Tag, Package, Zap, Crown,
  MessageCircle, Mail, FileText, Lock, Phone, RefreshCw,
  ChevronRight, ChevronDown, ChevronUp, ArrowRight, ArrowLeft,
  Check, X, AlertTriangle, Info, Ban, Trash2, Edit, Eye, EyeOff,
  Upload, Download, Send, Search, Filter, SlidersHorizontal,
  TrendingUp, BarChart2, PieChart, Clock, Calendar, Bell,
  Shield, Key, Globe, Link, Copy, ExternalLink, Bookmark,
  Heart, ThumbsUp, ThumbsDown, Flag, Award, Gift, Gem,
  ShoppingCart, CreditCard, Banknote, Coins, DollarSign,
  Gamepad2, Sword, Palette, Ticket, Repeat, RotateCcw,
  Users, UserCheck, UserX, UserPlus, Headphones,
  LogIn, UserCircle, Menu, MoreVertical, MoreHorizontal,
  CheckCircle, XCircle, AlertCircle, HelpCircle, PlusCircle,
  Layers, Box, Archive, Inbox, Send as SendIcon,
  Activity, Flame, Sparkles, Rocket, Target,
} from 'lucide-react'

const ICONS = {
  // Навигация
  home:        Home,
  catalog:     LayoutGrid,
  sell:        Plus,
  deals:       Handshake,
  profile:     UserCircle,
  wallet:      Wallet,
  admin:       Zap,
  menu:        Menu,
  more:        MoreVertical,

  // Действия
  login:       LogIn,
  logout:      LogOut,
  register:    UserPlus,
  settings:    Settings,
  edit:        Edit,
  delete:      Trash2,
  search:      Search,
  filter:      Filter,
  copy:        Copy,
  send:        Send,
  upload:      Upload,
  download:    Download,
  refresh:     RefreshCw,
  back:        ArrowLeft,
  forward:     ArrowRight,
  external:    ExternalLink,
  bookmark:    Bookmark,

  // Статусы
  check:       Check,
  checkCircle: CheckCircle,
  close:       X,
  xCircle:     XCircle,
  warning:     AlertTriangle,
  info:        Info,
  help:        HelpCircle,
  ban:         Ban,
  flag:        Flag,

  // Финансы
  dollar:      DollarSign,
  card:        CreditCard,
  banknote:    Banknote,
  coins:       Coins,
  trending:    TrendingUp,
  chart:       BarChart2,
  cart:        ShoppingCart,

  // Пользователи
  user:        User,
  users:       Users,
  userCheck:   UserCheck,
  userBan:     UserX,

  // Безопасность
  shield:      Shield,
  shieldCheck: ShieldCheck,
  lock:        Lock,
  key:         Key,
  eye:         Eye,
  eyeOff:      EyeOff,

  // Контент
  star:        Star,
  heart:       Heart,
  thumbUp:     ThumbsUp,
  thumbDown:   ThumbsDown,
  award:       Award,
  gift:        Gift,
  gem:         Gem,
  crown:       Crown,
  flame:       Flame,
  sparkles:    Sparkles,
  rocket:      Rocket,
  target:      Target,
  activity:    Activity,

  // Игровые категории
  game:        Gamepad2,
  sword:       Sword,
  palette:     Palette,
  ticket:      Ticket,
  package:     Package,
  box:         Box,
  layers:      Layers,

  // Коммуникация
  message:     MessageCircle,
  mail:        Mail,
  bell:        Bell,
  headphones:  Headphones,
  phone:       Phone,

  // Документы
  file:        FileText,
  globe:       Globe,
  link:        Link,
  tag:         Tag,
  clock:       Clock,
  calendar:    Calendar,

  // Стрелки
  right:       ChevronRight,
  down:        ChevronDown,
  up:          ChevronUp,

  // Сделки
  dispute:     AlertCircle,
  refund:      RotateCcw,
  confirm:     CheckCircle,
  deliver:     Package,
  inbox:       Inbox,
  repeat:      Repeat,
}

export default function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.75, style = {}, className = '' }) {
  const Component = ICONS[name]
  if (!Component) {
    console.warn(`[Icon] Unknown icon: "${name}"`)
    return null
  }
  return (
    <Component
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      className={className}
    />
  )
}

// Экспортируем все иконки для прямого использования
export {
  Wallet, ShieldCheck, Handshake, LayoutGrid, Home, Plus,
  User, LogOut, Settings, Star, Tag, Package, Zap, Crown,
  MessageCircle, Mail, FileText, Lock, Phone, RefreshCw,
  ChevronRight, ChevronDown, ChevronUp, ArrowRight, ArrowLeft,
  Check, X, AlertTriangle, Info, Ban, Trash2, Edit, Eye, EyeOff,
  Upload, Download, Send, Search, Filter,
  TrendingUp, BarChart2, Clock, Calendar, Bell,
  Shield, Key, Globe, Link, Copy, ExternalLink, Bookmark,
  Heart, ThumbsUp, ThumbsDown, Flag, Award, Gift, Gem,
  ShoppingCart, CreditCard, Banknote, Coins, DollarSign,
  Gamepad2, Sword, Palette, Ticket, Repeat, RotateCcw,
  Users, UserCheck, UserX, UserPlus, Headphones,
  LogIn, UserCircle, Menu, MoreVertical,
  CheckCircle, XCircle, AlertCircle, HelpCircle,
  Layers, Box, Archive, Inbox,
  Activity, Flame, Sparkles, Rocket, Target,
}
